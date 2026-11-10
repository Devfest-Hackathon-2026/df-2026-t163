"""駅名の読みと路線のイメージカラーを Gemini で付ける。駅データにどちらも無いため。"""
from __future__ import annotations

import re

from pydantic import BaseModel

from . import gemini
from .schemas import LineColor, ReadingsRequest, ReadingsResponse, StationReading

SYSTEM = """日本の鉄道の駅名の読みと、路線のイメージカラーを答えます。
- readings: 駅名ごとに 1 件。kana は駅名全体のひらがな（「JR」は「じぇいあーる」）。
  romaji は駅名標の表記（先頭大文字、長音は Ō のようにマクロン、例: Ōsaka, Shin-Ōsaka）。name は与えられた駅名のまま。
- lineColors: 路線ごとに 1 件。路線記号の公式の色を優先し、無ければその会社の車体や社章の代表色を #RRGGBB で（例: 阪急各線は車体のマルーン #7A1F2B）。line は与えられた路線名のまま。"""

HEX_COLOR = re.compile(r"#[0-9a-fA-F]{6}")


class _Details(BaseModel):
    readings: list[StationReading]
    lineColors: list[LineColor]


def generate(req: ReadingsRequest) -> ReadingsResponse:
    prompt = f"駅名: {', '.join(req.names) or 'なし'}\n路線: {', '.join(req.lines) or 'なし'}"
    res = gemini.generate_json([prompt], _Details, system=SYSTEM, temperature=0)
    names, lines = set(req.names), set(req.lines)
    return ReadingsResponse(
        readings=[r for r in res.readings if r.name in names],
        lineColors=[c for c in res.lineColors if c.line in lines and HEX_COLOR.fullmatch(c.color)],
    )
