"""駅周辺の実在スポット → Gemini でビンゴ用ミッションにする。

ハルシネーション対策：Gemini には候補リストの ref だけ選ばせ、店名・徒歩分数・マップ URL は
Places のデータからバックエンドが埋める。候補に無い ref は捨てる。
→ 「存在しない店」が画面に出ることが構造的に起きない。
"""
from __future__ import annotations

import json
import logging
import random

from . import gemini, places
from .places import Spot
from .schemas import CATEGORIES, GeminiMissionPlan, Mission, MissionsRequest, MissionsResponse, Stamp

log = logging.getLogger(__name__)

N_MISSIONS = 8
STAMP_PRIORITY = ["shrine", "culture", "view", "park", "shop", "bakery", "sweets", "cafe", "food", "bench", "other"]

SYSTEM = """あなたは「定期券すごろく＆駅ビンゴ」のゲームマスターです。
通学定期で素通りしている途中駅に、学生がふらっと降りて楽しめる「途中下車ミッション」を作ります。

ルール:
- 必ず与えられた候補リストの中のスポットだけを使い、ref で指定する。リストに無い店や場所は絶対に作らない。
- 8個のミッションはすべて違う ref にし、ジャンルがなるべくばらけるようにする。
- 調べなくても行けば達成できる、具体的で小さな行動にする（例: パンをひとつ買う、鳥居の前で写真を撮る、ベンチで3分休む）。
- お金がかかるものは学生でも気軽な範囲（数百円）に。営業時間や混雑に左右されにくい内容が望ましい。
- title は全角12文字前後で、ゲームっぽくワクワクする言い回しに。
- description には店名と駅からの徒歩分数を自然に入れ、何をすればクリアかを1〜2文で書く。
- 8個のうち2〜3個は、写真に残すと楽しいミッションにして photoHint に何を写すとよいかを書く。残りの photoHint は空文字。
- 危険な行為、迷惑行為、私有地への立ち入り、人物の無断撮影を求める内容は作らない。
"""


def _candidates_text(spots: list[Spot]) -> str:
    rows = [
        {
            "ref": f"p{i + 1}",
            "name": s.name,
            "genre": s.category,
            "type": s.primary_type,
            "walkMinutes": s.walk_minutes,
            "rating": s.rating,
            "reviews": s.rating_count,
        }
        for i, s in enumerate(spots)
    ]
    return json.dumps(rows, ensure_ascii=False)


def build_prompt(req: MissionsRequest, spots: list[Spot]) -> str:
    return (
        f"駅: {req.lineName} {req.stationName}駅\n"
        f"残り時間: {req.timeMinutes}分\n\n"
        f"候補スポット（Google マップの実在データ）:\n{_candidates_text(spots)}\n\n"
        f"この中から {N_MISSIONS} 個選んで、3×3 ビンゴ用のミッションを作ってください。"
    )


def _mission_from_spot(mid: str, spot: Spot, *, title: str, description: str, category: str,
                       photo_hint: str = "") -> Mission:
    return Mission(
        id=mid,
        title=title[:40],
        description=description[:200],
        spotName=spot.name,
        category=category if category in CATEGORIES else spot.category,
        walkMinutes=spot.walk_minutes,
        placeId=spot.place_id,
        mapsUrl=spot.maps_url,
        photoHint=photo_hint[:80],
    )


# Gemini が使えないとき・数が足りないときの、テンプレートによるミッション（スポットは実在）
TEMPLATES = {
    "bakery": ("パンをひとつ買う", "{name}（徒歩{w}分）で、気になったパンをひとつ買ってみよう。"),
    "sweets": ("甘いものを調達", "{name}（徒歩{w}分）で、おやつをひとつ選んでみよう。"),
    "cafe": ("カフェでひと休み", "{name}（徒歩{w}分）で、座ってひと息つこう。"),
    "park": ("公園でひと休み", "{name}（徒歩{w}分）まで歩いて、ベンチで3分ぼーっとしよう。"),
    "shrine": ("お参りしてくる", "{name}（徒歩{w}分）にお参りして、手を合わせてこよう。"),
    "culture": ("ちょっと文化体験", "{name}（徒歩{w}分）にふらっと入ってみよう。"),
    "view": ("いい景色を探す", "{name}（徒歩{w}分）で、いちばんいい角度を探してみよう。"),
    "shop": ("お店をのぞいてみる", "{name}（徒歩{w}分）をのぞいて、気になるものを1つ見つけよう。"),
    "food": ("軽くなにか食べる", "{name}（徒歩{w}分）で、軽くなにか食べてみよう。"),
    "bench": ("座れる場所を探す", "{name}（徒歩{w}分）で、座れる場所を見つけよう。"),
    "other": ("寄り道してみる", "{name}（徒歩{w}分）に寄り道してみよう。"),
}


def template_mission(mid: str, spot: Spot) -> Mission:
    cat = spot.category
    title, desc = TEMPLATES.get(cat, TEMPLATES["other"])
    w = spot.walk_minutes
    return _mission_from_spot(mid, spot, title=title, description=desc.format(name=spot.name, w=w if w else "1"), category=cat)


def assemble(plan: GeminiMissionPlan | None, spots: list[Spot]) -> tuple[list[Mission], Stamp | None]:
    """Gemini の出力を検証して、Places のデータで埋めた Mission に組み立てる。"""
    by_ref = {f"p{i + 1}": s for i, s in enumerate(spots)}
    used: set[str] = set()
    out: list[Mission] = []

    if plan:
        for gm in plan.missions:
            spot = by_ref.get(gm.ref.strip())
            if not spot or spot.place_id in used:
                continue  # 候補に無い・重複 → 捨てる
            used.add(spot.place_id)
            out.append(_mission_from_spot(
                f"m{len(out) + 1}", spot,
                title=gm.title.strip() or TEMPLATES.get(spot.category, TEMPLATES["other"])[0],
                description=gm.description.strip() or f"{spot.name}に寄ってみよう。",
                category=gm.category,
                photo_hint=gm.photoHint.strip(),
            ))
            if len(out) >= N_MISSIONS:
                break

    # 足りない分は残りの実在スポットからテンプレートで埋める
    for spot in spots:
        if len(out) >= N_MISSIONS:
            break
        if spot.place_id not in used:
            used.add(spot.place_id)
            out.append(template_mission(f"m{len(out) + 1}", spot))

    stamp = None
    stamp_spot = by_ref.get(plan.stampRef.strip()) if plan else None
    if stamp_spot and stamp_spot.place_id in used:
        stamp = Stamp(category=stamp_spot.category, label=stamp_spot.name[:30])
    elif out:
        best = min(out, key=lambda m: STAMP_PRIORITY.index(m.category) if m.category in STAMP_PRIORITY else 99)
        stamp = Stamp(category=best.category, label=best.spotName[:30])
    return out, stamp


def generate(req: MissionsRequest) -> MissionsResponse:
    origin = (req.lat, req.lng) if req.lat is not None and req.lng is not None else None
    _, spots = places.nearby_spots(req.stationName, req.timeMinutes, origin)
    if not spots:
        raise places.PlacesError(f"{req.stationName}駅の周辺でスポットが見つかりませんでした")

    plan, note = None, ""
    try:
        plan = gemini.generate_json([build_prompt(req, spots)], GeminiMissionPlan, system=SYSTEM, temperature=0.9)
    except gemini.GeminiError as e:
        log.warning("Gemini failed, using templates: %s", e)
        note = "AI 生成に失敗したため、テンプレートのミッションです"

    missions, stamp = assemble(plan, spots)
    if plan is None:
        random.shuffle(missions)
    if len(missions) < N_MISSIONS and not note:
        note = f"周辺スポットが少なく {len(missions)} 個だけ生成しました"
    return MissionsResponse(missions=missions, stamp=stamp, note=note)
