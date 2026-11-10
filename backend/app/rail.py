"""全国の鉄道路線・駅データ（HeartRails Express API）。バスは含まない。

無料利用の条件としてアプリ内にクレジットを表示している（frontend/js/route.js）。
路線と駅の並びはほぼ変わらないのでメモリにキャッシュする。
"""
from __future__ import annotations

from functools import lru_cache

import requests

BASE = "https://express.heartrails.com/api/json"


class RailError(RuntimeError):
    pass


class RailNotFound(RailError):
    pass


def _get(params: dict) -> dict:
    try:
        res = requests.get(BASE, params=params, timeout=10)
        res.raise_for_status()
        data = res.json().get("response", {})
    except (requests.RequestException, ValueError) as e:
        raise RailError(f"駅データ API に接続できません: {e}") from e
    if "error" in data:
        raise RailNotFound(str(data["error"]))
    return data


def _station(raw: dict) -> dict:
    return {
        "name": raw["name"],
        "line": raw["line"],
        "prefecture": raw.get("prefecture", ""),
        "lat": raw["y"],
        "lng": raw["x"],
        "prev": raw.get("prev"),
        "next": raw.get("next"),
    }


@lru_cache(maxsize=64)
def lines(prefecture: str) -> tuple[str, ...]:
    return tuple(_get({"method": "getLines", "prefecture": prefecture}).get("line", []))


@lru_cache(maxsize=1024)
def stations(line: str) -> tuple[dict, ...]:
    """路線の駅を、線路の順番どおりに返す。"""
    return tuple(_station(s) for s in _get({"method": "getStations", "line": line}).get("station", []))


def nearby(lat: float, lng: float) -> list[dict]:
    """座標の近くの駅（乗り換え候補の路線を出すのに使う）。"""
    return [_station(s) for s in _get({"method": "getStations", "x": lng, "y": lat}).get("station", [])]
