"""Places API (New) で駅の位置と、駅周辺の実在スポットを取る。"""
from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from urllib.parse import quote

import requests

from . import config

BASE = "https://places.googleapis.com/v1/places"
WALK_M_PER_MIN = 80  # 不動産表示と同じ「80m = 徒歩1分」
ROUTE_FACTOR = 1.25  # 直線距離 → 実際に歩く距離のざっくり補正

PLACE_FIELDS = [
    "id", "displayName", "location", "primaryType", "types",
    "googleMapsUri", "rating", "userRatingCount", "businessStatus",
]

NEARBY_TYPES = ["cafe", "bakery", "restaurant", "park", "museum", "tourist_attraction", "book_store", "library", "art_gallery"]
TEXT_QUERIES = ["神社 お寺", "スイーツ 和菓子", "商店街"]


class PlacesError(RuntimeError):
    pass


@dataclass
class Spot:
    place_id: str
    name: str
    lat: float
    lng: float
    primary_type: str
    types: list[str]
    maps_url: str
    rating: float | None
    rating_count: int
    distance_m: float = 0.0

    @property
    def walk_minutes(self) -> int:
        return max(0, round(self.distance_m * ROUTE_FACTOR / WALK_M_PER_MIN))

    @property
    def category(self) -> str:
        return guess_category(self.name, self.primary_type, self.types)


def radius_for(time_minutes: int) -> int:
    """残り時間から片道の徒歩圏（m）を決める。API_CONTRACT.md の目安どおり。"""
    if time_minutes <= 30:
        walk = 5
    elif time_minutes <= 60:
        walk = 10
    else:
        walk = 15
    return int(walk * WALK_M_PER_MIN / ROUTE_FACTOR)


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def guess_category(name: str, primary_type: str, types: list[str]) -> str:
    """Places の type と名前から、フロントのアイコン用カテゴリを決める。"""
    t = set(types or []) | ({primary_type} if primary_type else set())
    if any(k in name for k in ("神社", "寺", "宮", "稲荷", "天満")) or t & {"place_of_worship", "hindu_temple", "buddhist_temple", "shinto_shrine"}:
        return "shrine"
    if "bakery" in t or "パン" in name or "ベーカリー" in name:
        return "bakery"
    if t & {"dessert_shop", "confectionery", "ice_cream_shop", "candy_store", "chocolate_shop", "donut_shop", "dessert_restaurant"} or any(k in name for k in ("菓子", "ケーキ", "スイーツ")):
        return "sweets"
    if t & {"cafe", "coffee_shop", "tea_house"}:
        return "cafe"
    if "商店街" in name:
        return "shop"
    if t & {"park", "garden", "playground", "dog_park"} or "公園" in name:
        return "park"
    if t & {"museum", "art_gallery", "library", "historical_landmark", "cultural_center", "performing_arts_theater"}:
        return "culture"
    if t & {"tourist_attraction", "observation_deck", "scenic_spot"}:
        return "view"
    if t & {"restaurant", "food", "meal_takeaway", "ramen_restaurant", "japanese_restaurant"} or primary_type.endswith("_restaurant"):
        return "food"
    if t & {"store", "book_store", "shopping_mall", "clothing_store", "market", "gift_shop"}:
        return "shop"
    return "other"


def maps_url(name: str, place_id: str) -> str:
    return f"https://www.google.com/maps/search/?api=1&query={quote(name)}&query_place_id={quote(place_id)}"


def _headers(fields: list[str]) -> dict:
    if not config.MAPS_API_KEY:
        raise PlacesError("MAPS_API_KEY が設定されていません")
    return {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": config.MAPS_API_KEY,
        "X-Goog-FieldMask": ",".join(f"places.{f}" for f in fields),
    }


def _post(path: str, body: dict, fields: list[str]) -> list[dict]:
    try:
        res = requests.post(f"{BASE}:{path}", json=body, headers=_headers(fields), timeout=10)
    except requests.RequestException as e:
        raise PlacesError(f"Places API に接続できません: {e}") from e
    if res.status_code != 200:
        raise PlacesError(f"Places API {path} → HTTP {res.status_code}: {res.text[:300]}")
    return res.json().get("places", [])


def station_query(station_name: str) -> str:
    name = station_name.removesuffix("駅")
    return f"{name}駅" if name.startswith("JR") else f"JR{name}駅"


@lru_cache(maxsize=256)
def locate_station(station_name: str) -> tuple[float, float]:
    """駅名 → 緯度経度。1 駅 1 回だけ問い合わせてキャッシュする。"""
    places = _post(
        "searchText",
        {
            "textQuery": station_query(station_name),
            "includedType": "train_station",
            "languageCode": "ja",
            "regionCode": "JP",
            "pageSize": 1,
            # 関西に寄せる（同名駅の取り違え防止）
            "locationBias": {"circle": {"center": {"latitude": 34.75, "longitude": 135.4}, "radius": 50000.0}},
        },
        ["id", "displayName", "location"],
    )
    if not places:
        raise PlacesError(f"駅が見つかりません: {station_name}")
    loc = places[0]["location"]
    return loc["latitude"], loc["longitude"]


def parse_place(p: dict, origin: tuple[float, float]) -> Spot | None:
    if p.get("businessStatus") not in (None, "OPERATIONAL"):
        return None
    loc = p.get("location") or {}
    name = (p.get("displayName") or {}).get("text", "").strip()
    pid = p.get("id", "")
    if not (name and pid and "latitude" in loc and "longitude" in loc):
        return None
    types = p.get("types") or []
    # 駅そのものは真ん中の FREE マスと被るので除外
    if "train_station" in types or "transit_station" in types or name.endswith("駅"):
        return None
    spot = Spot(
        place_id=pid,
        name=name,
        lat=loc["latitude"],
        lng=loc["longitude"],
        primary_type=p.get("primaryType", ""),
        types=types,
        maps_url=maps_url(name, pid),
        rating=p.get("rating"),
        rating_count=int(p.get("userRatingCount") or 0),
    )
    spot.distance_m = haversine_m(origin[0], origin[1], spot.lat, spot.lng)
    return spot


def merge_spots(batches: list[list[dict]], origin: tuple[float, float], radius_m: int, limit: int = 30) -> list[Spot]:
    """複数の検索結果をまとめて、重複除去・範囲外除去・並べ替えする。"""
    seen: dict[str, Spot] = {}
    for batch in batches:
        for p in batch:
            s = parse_place(p, origin)
            if s and s.distance_m <= radius_m * 1.15 and s.place_id not in seen:
                seen[s.place_id] = s
    spots = list(seen.values())
    # 口コミが多い（＝行けば分かる）順。同点は近い順
    spots.sort(key=lambda s: (-min(s.rating_count, 500), s.distance_m))
    # ジャンルが偏らないように、カテゴリごとに順番に取る
    by_cat: dict[str, list[Spot]] = {}
    for s in spots:
        by_cat.setdefault(s.category, []).append(s)
    out: list[Spot] = []
    while len(out) < limit and any(by_cat.values()):
        for cat in list(by_cat):
            if by_cat[cat]:
                out.append(by_cat[cat].pop(0))
                if len(out) >= limit:
                    break
    return out


def nearby_spots(station_name: str, time_minutes: int,
                 origin: tuple[float, float] | None = None) -> tuple[tuple[float, float], list[Spot]]:
    """origin（駅の座標）があれば駅の検索は省く。無いときは JR の駅として探す。"""
    origin = origin or locate_station(station_name)
    radius = radius_for(time_minutes)
    circle = {"circle": {"center": {"latitude": origin[0], "longitude": origin[1]}, "radius": float(radius)}}

    jobs = [("searchNearby", {
        "includedTypes": NEARBY_TYPES,
        "maxResultCount": 20,
        "rankPreference": "POPULARITY",
        "languageCode": "ja",
        "regionCode": "JP",
        "locationRestriction": circle,
    })]
    for q in TEXT_QUERIES:
        jobs.append(("searchText", {
            "textQuery": q,
            "languageCode": "ja",
            "regionCode": "JP",
            "pageSize": 10,
            "locationBias": circle,
        }))

    with ThreadPoolExecutor(max_workers=len(jobs)) as ex:
        futures = [ex.submit(_post, path, body, PLACE_FIELDS) for path, body in jobs]
        batches, errors = [], []
        for f in futures:
            try:
                batches.append(f.result())
            except PlacesError as e:
                errors.append(e)
    if not batches:
        raise errors[0]
    return origin, merge_spots(batches, origin, radius)
