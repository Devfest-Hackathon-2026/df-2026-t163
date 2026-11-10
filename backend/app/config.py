"""環境変数から設定を読む。.env があれば読み込む（python-dotenv が無くても動く）。"""
import os
from pathlib import Path


def _load_dotenv() -> None:
    env = Path(__file__).resolve().parent.parent / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_dotenv()

# Google Maps Platform（Places API (New)）の API キー
MAPS_API_KEY = os.getenv("MAPS_API_KEY", "")

# Vertex AI（Gemini）
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
GOOGLE_CLOUD_LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "global")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-3.1-flash-image")

# 生成したスタンプを全ユーザーで共有する Cloud Storage バケット（空なら共有せず毎回生成）
STAMP_BUCKET = os.getenv("STAMP_BUCKET", "")
# 1 日あたりの画像生成の上限（インスタンスごと）。共有済みのスタンプの配信は数えない
STAMP_DAILY_LIMIT = int(os.getenv("STAMP_DAILY_LIMIT", "30"))
# 1 日あたりの文章生成の上限（インスタンスごと）。超えたらミッションはテンプレートになる
GEMINI_DAILY_LIMIT = int(os.getenv("GEMINI_DAILY_LIMIT", "300"))

# CORS で許可するフロントの URL（カンマ区切り）。"*" なら全部許可
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

# 同じサービスでフロントも配信する場合の frontend/ のパス（無ければ配信しない）
FRONTEND_DIR = os.getenv("FRONTEND_DIR", "")
