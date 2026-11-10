"""駅スタンプの線画をその場で生成する（Vertex AI の画像モデル）。

店名や場所は Places の実在データから来る。画像は白地に黒インクで作らせ、
スタンプ用のマスクへの変換はフロント（js/stampMaker.js）で行う。
"""
from __future__ import annotations

import base64
import hashlib
import logging
from functools import lru_cache
from pathlib import Path

from google.api_core.exceptions import PreconditionFailed

from . import config, gemini, rail
from .quota import DailyQuota
from .schemas import StampArtRequest, StampArtResponse

log = logging.getLogger(__name__)

STYLE_VERSION = "v1"

FALLBACK_SUBJECT = {
    "food": "a steaming bowl of noodles",
    "cafe": "a steaming coffee cup on a small table",
    "sweets": "a slice of cake and Japanese sweets",
    "bakery": "a basket of freshly baked bread",
    "park": "a large tree and a bench in a park",
    "shrine": "a Japanese torii gate",
    "shop": "a row of small shop fronts under an arcade",
    "view": "a scenic Japanese townscape",
    "culture": "a museum building with columns",
    "bench": "a wooden bench under a tree",
}
DEFAULT_SUBJECT = "a Japanese train arriving at a small station platform"

# 作者が尼崎〜明石用に作ったスタンプ。同じシリーズに見えるよう見本として毎回渡す
STYLE_REF_DIR = Path(__file__).parent / "style_refs"

PROMPT = """The attached images are existing stamps from one series of Japanese station stamps.
Draw one NEW illustration that looks like it belongs to the same series.

Subject: {landmark}, near {station} Station in Japan.
If you do not know what it looks like, draw {fallback} instead of inventing a building.

MATCH THE ATTACHED STYLE EXACTLY:
- Clean geometric vector line art, as if drawn with a thick marker and a ruler. No brush texture, no sketchy or wobbly lines.
- Thick, even black outlines. Thinner straight lines for a few inner details only.
- Solid black fill for doors, windows in shadow and other dark areas.
- Simple flat view from the front, symmetrical when the subject allows it.
- Subject large and centered, standing on one straight horizontal ground line that runs edge to edge.
- At most two small outlined clouds in the sky, or a simple tree beside the subject.

DO NOT DRAW: a circular or square frame or border, text, letters, numbers, signs, logos, brand marks, people, cars, gray, gradients or color.

OUTPUT: square image, pure black ink on a pure white background.
"""


@lru_cache(maxsize=1)
def _style_refs() -> tuple:
    return tuple(gemini.image_part(p.read_bytes(), "image/png") for p in sorted(STYLE_REF_DIR.glob("*.png")))


class DailyLimitExceeded(RuntimeError):
    pass


_quota = DailyQuota(lambda: config.STAMP_DAILY_LIMIT)


@lru_cache(maxsize=1)
def _bucket():
    from google.cloud import storage

    return storage.Client(project=config.GOOGLE_CLOUD_PROJECT).bucket(config.STAMP_BUCKET)


def _blob(station_key: str):
    # 駅 ID には日本語や記号が入るのでハッシュにする。絵柄を作り直すときは STYLE_VERSION を上げる
    digest = hashlib.sha256(station_key.encode()).hexdigest()
    return _bucket().blob(f"stamps/{STYLE_VERSION}/{digest}.png")


def _load_shared(station_key: str) -> bytes | None:
    """共有済みのスタンプ。保存先の障害でゲームを止めないよう、失敗は「無い」扱いにする。"""
    if not (config.STAMP_BUCKET and station_key):
        return None
    try:
        blob = _blob(station_key)
        return blob.download_as_bytes() if blob.exists() else None
    except Exception as e:
        log.warning("stamp load failed: %s", e)
        return None


def _save_shared(station_key: str, data: bytes, mime: str) -> bytes:
    """最初に作った人のスタンプを正にする。同時に作られたら先に保存されたほうを返す。"""
    if not (config.STAMP_BUCKET and station_key):
        return data
    try:
        _blob(station_key).upload_from_string(data, content_type=mime, if_generation_match=0)
    except PreconditionFailed:
        return _load_shared(station_key) or data
    except Exception as e:
        log.warning("stamp save failed: %s", e)
    return data


def _verified_station_key(req: StampArtRequest) -> str:
    """実在の駅だけ受け付ける。保存キーは駅データの値で作り、リクエストの値で増やせないようにする。"""
    for station in rail.nearby(req.lat, req.lng):
        if station["name"] == req.stationName:
            return f'{station["name"]}@{station["lat"]:.3f},{station["lng"]:.3f}'
    raise rail.RailNotFound(f"駅が見つかりません: {req.stationName}")


def generate(req: StampArtRequest) -> StampArtResponse:
    station_key = _verified_station_key(req)
    shared = _load_shared(station_key)
    if shared is not None:
        return StampArtResponse(imageBase64=base64.b64encode(shared).decode(), mimeType="image/png")

    if not _quota.take():
        raise DailyLimitExceeded
    fallback = FALLBACK_SUBJECT.get(req.category, DEFAULT_SUBJECT)
    prompt = PROMPT.format(landmark=req.landmark or fallback, station=req.stationName, fallback=fallback)
    data, mime = gemini.generate_image([*_style_refs(), prompt])
    data = _save_shared(station_key, data, mime)
    return StampArtResponse(imageBase64=base64.b64encode(data).decode(), mimeType=mime)
