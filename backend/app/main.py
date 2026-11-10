"""定期券すごろく＆駅ビンゴ — バックエンド API（FastAPI / Cloud Run）

  POST /api/missions  駅周辺の実在スポット（Places API）→ Gemini でビンゴ用ミッション
  GET  /api/rail/...  全国の路線・駅データ（定期区間えらび用）
  POST /api/rail/readings  駅名の読み
  POST /api/stamp-art  駅スタンプの線画を生成
  GET  /healthz       ヘルスチェック

仕様は frontend/API_CONTRACT.md。
"""
from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config, gemini, missions, places, rail, readings, stamp_art
from .schemas import (
    MissionsRequest, MissionsResponse, RailStation, ReadingsRequest, ReadingsResponse,
    StampArtRequest, StampArtResponse,
)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("tamago")

app = FastAPI(title="定期券すごろく＆駅ビンゴ API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
    max_age=3600,
)


@app.get("/healthz")
def healthz() -> dict:
    return {
        "ok": True,
        "maps_key": bool(config.MAPS_API_KEY),
        "project": bool(config.GOOGLE_CLOUD_PROJECT),
        "model": config.GEMINI_MODEL,
    }


# 同期関数にしておくと FastAPI がスレッドプールで実行してくれる（requests / genai はブロッキング）
@app.post("/api/missions", response_model=MissionsResponse)
def post_missions(req: MissionsRequest) -> MissionsResponse:
    try:
        return missions.generate(req)
    except places.PlacesError as e:
        log.error("places error: %s", e)
        raise HTTPException(status_code=502, detail=str(e)) from e


def _rail(call, *args):
    try:
        return call(*args)
    except rail.RailNotFound as e:
        raise HTTPException(status_code=404, detail="路線または駅が見つかりません") from e
    except rail.RailError as e:
        log.error("rail error: %s", e)
        raise HTTPException(status_code=502, detail="駅データを取得できませんでした") from e


@app.get("/api/rail/lines", response_model=list[str])
def get_rail_lines(prefecture: str = Query(min_length=2, max_length=4)) -> list[str]:
    return list(_rail(rail.lines, prefecture))


@app.get("/api/rail/stations", response_model=list[RailStation])
def get_rail_stations(line: str = Query(min_length=1, max_length=60)) -> list[dict]:
    return list(_rail(rail.stations, line))


@app.get("/api/rail/nearby", response_model=list[RailStation])
def get_rail_nearby(lat: float = Query(ge=-90, le=90), lng: float = Query(ge=-180, le=180)) -> list[dict]:
    return _rail(rail.nearby, lat, lng)


@app.post("/api/rail/readings", response_model=ReadingsResponse)
def post_rail_readings(req: ReadingsRequest) -> ReadingsResponse:
    try:
        return readings.generate(req)
    except gemini.GeminiError as e:
        log.error("readings error: %s", e)
        raise HTTPException(status_code=502, detail="駅名の読みを取得できませんでした") from e


@app.post("/api/stamp-art", response_model=StampArtResponse)
def post_stamp_art(req: StampArtRequest) -> StampArtResponse:
    try:
        return _rail(stamp_art.generate, req)
    except stamp_art.DailyLimitExceeded as e:
        raise HTTPException(status_code=429, detail="今日のスタンプ作成の上限に達しました") from e
    except gemini.GeminiError as e:
        log.error("stamp art error: %s", e)
        raise HTTPException(status_code=502, detail="スタンプを作れませんでした") from e


class RevalidatedStaticFiles(StaticFiles):
    """更新後に新旧の JS モジュールが混ざって起動できなくなるのを防ぐため、毎回 ETag で確認させる。"""

    async def get_response(self, path, scope):
        res = await super().get_response(path, scope)
        res.headers["Cache-Control"] = "no-cache"
        return res


# FRONTEND_DIR を指定すると、フロントも同じサービスで配信する（CORS 不要になる）
if config.FRONTEND_DIR and Path(config.FRONTEND_DIR).is_dir():
    app.mount("/", RevalidatedStaticFiles(directory=config.FRONTEND_DIR, html=True), name="frontend")
