"""API の入出力と、Gemini に渡す responseSchema（frontend/API_CONTRACT.md と対応）。"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Category = Literal["food", "cafe", "sweets", "bakery", "park", "shrine", "shop", "view", "culture", "bench", "other"]
CATEGORIES: tuple[str, ...] = Category.__args__  # type: ignore[attr-defined]


# ---------- /api/missions ----------
class MissionsRequest(BaseModel):
    lineId: str = ""
    lineName: str = ""
    stationId: str = ""
    stationName: str = Field(min_length=1, max_length=40)
    timeMinutes: int = Field(default=60, ge=10, le=240)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class Mission(BaseModel):
    id: str
    title: str
    description: str
    spotName: str
    category: Category
    walkMinutes: int
    placeId: str
    mapsUrl: str
    photoHint: str = ""


class Stamp(BaseModel):
    category: Category
    label: str


class MissionsResponse(BaseModel):
    missions: list[Mission]
    stamp: Stamp | None = None
    note: str = ""


# Gemini に出させる形。spotName / walkMinutes / mapsUrl は Gemini に作らせず、
# 候補リストの ref（p1, p2, ...）だけ選ばせて、あとからバックエンドが Places のデータで埋める。
class GeminiMission(BaseModel):
    ref: str = Field(description="候補リストの ref（例: p3）。リストに無いものは使わない")
    title: str = Field(description="マスに出す短いミッション。全角12文字前後")
    description: str = Field(description="詳細シートの説明。80〜120文字程度。店名と徒歩分数を自然に含める")
    category: Category
    photoHint: str = Field(description="写真に残すと楽しいミッションの撮影ヒント。無ければ空文字")


class GeminiMissionPlan(BaseModel):
    missions: list[GeminiMission] = Field(description="ちょうど8個。すべて違う ref")
    stampRef: str = Field(description="この駅のスタンプの絵柄にふさわしい、駅を代表するスポットの ref")


# ---------- /api/rail ----------
class RailStation(BaseModel):
    name: str
    line: str
    prefecture: str = ""
    lat: float
    lng: float
    prev: str | None = None
    next: str | None = None


class ReadingsRequest(BaseModel):
    names: list[str] = Field(default=[], max_length=150)
    lines: list[str] = Field(default=[], max_length=20)


class StationReading(BaseModel):
    name: str
    kana: str = Field(max_length=60)
    romaji: str = Field(max_length=80)


class LineColor(BaseModel):
    line: str
    color: str = Field(description="路線のイメージカラー。#RRGGBB")


class ReadingsResponse(BaseModel):
    readings: list[StationReading]
    lineColors: list[LineColor] = []


# ---------- /api/stamp-art ----------
class StampArtRequest(BaseModel):
    stationName: str = Field(min_length=1, max_length=40)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    landmark: str = Field(default="", max_length=60)
    category: str = Field(default="station", max_length=20)


class StampArtResponse(BaseModel):
    imageBase64: str
    mimeType: str
