"""Vertex AI 経由の Gemini クライアント（配布クレジットを使うため AI Studio ではなく Vertex AI）。"""
from __future__ import annotations

from functools import lru_cache
from typing import TypeVar

from pydantic import BaseModel

from . import config
from .quota import DailyQuota

T = TypeVar("T", bound=BaseModel)


class GeminiError(RuntimeError):
    pass


_text_quota = DailyQuota(lambda: config.GEMINI_DAILY_LIMIT)


@lru_cache(maxsize=1)
def _client():
    try:
        from google import genai
    except ImportError as e:  # pragma: no cover
        raise GeminiError("google-genai がインストールされていません（pip install -r requirements.txt）") from e
    if not config.GOOGLE_CLOUD_PROJECT:
        raise GeminiError("GOOGLE_CLOUD_PROJECT が設定されていません")
    from google.genai import types

    # 429（一時的なリソース不足）や 5xx は数秒待てば通ることが多いので SDK に軽くリトライさせる。
    # フロントのタイムアウトが 30 秒なので、待ち時間は短めに抑える。
    retry = types.HttpRetryOptions(attempts=3, initial_delay=1.0, max_delay=4.0, http_status_codes=[429, 500, 502, 503, 504])
    return genai.Client(
        vertexai=True,
        project=config.GOOGLE_CLOUD_PROJECT,
        location=config.GOOGLE_CLOUD_LOCATION,
        http_options=types.HttpOptions(retry_options=retry),
    )


def _thinking_config(types):
    """2.x 系は thinking_budget、3 系以降は thinking_level（3 系に budget を渡すと 400 になる）。"""
    if config.GEMINI_MODEL.startswith("gemini-2"):
        return types.ThinkingConfig(thinking_budget=0)
    return types.ThinkingConfig(thinking_level=types.ThinkingLevel.MINIMAL)


def generate_json(contents: list, schema: type[T], *, system: str, temperature: float = 0.8) -> T:
    """Structured Outputs で schema どおりの JSON を生成して Pydantic で受け取る。"""
    from google.genai import types

    if not _text_quota.take():
        raise GeminiError("今日の文章生成の上限に達しました")

    try:
        res = _client().models.generate_content(
            model=config.GEMINI_MODEL,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system,
                response_mime_type="application/json",
                response_schema=schema,
                temperature=temperature,
                # Flash の思考は短めで十分（レスポンス速度優先）
                thinking_config=_thinking_config(types),
            ),
        )
    except GeminiError:
        raise
    except Exception as e:
        raise GeminiError(f"Gemini の呼び出しに失敗: {e}") from e

    if isinstance(res.parsed, schema):
        return res.parsed
    try:
        return schema.model_validate_json(res.text or "")
    except Exception as e:
        raise GeminiError(f"Gemini の出力を JSON として読めません: {(res.text or '')[:200]}") from e


def generate_image(contents: list) -> tuple[bytes, str]:
    """画像モデルで 1 枚生成して (データ, MIME タイプ) を返す。"""
    from google.genai import types

    try:
        res = _client().models.generate_content(
            model=config.GEMINI_IMAGE_MODEL,
            contents=contents,
            # スタンプは 320px のマスクにするので 512 で足りる（1K より約 3 割安い）
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(image_size="512"),
            ),
        )
    except Exception as e:
        raise GeminiError(f"画像の生成に失敗: {e}") from e
    for candidate in res.candidates or []:
        for part in (candidate.content.parts if candidate.content else None) or []:
            if part.inline_data and part.inline_data.data:
                return part.inline_data.data, part.inline_data.mime_type or "image/png"
    raise GeminiError("画像モデルの応答に画像がありません")


def image_part(data: bytes, mime_type: str):
    from google.genai import types

    return types.Part.from_bytes(data=data, mime_type=mime_type)
