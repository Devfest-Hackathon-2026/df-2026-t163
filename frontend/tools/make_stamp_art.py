#!/usr/bin/env python3
"""
駅スタンプの線画を一括で作るツール

  写真（photos/{駅ID}.jpg）
    → ① Gemini（テキスト）が写真を見て「その駅らしい形」を英語で説明
    → ② Gemini（画像）が写真をデフォルメした白黒の線画を描く
    → ③ スタンプ用に変換（白い線／黒い背景の 600px PNG）して frontend/assets/stamps/{駅ID}.png に保存
    → ④ frontend/js/data/stampArt.js を書き換えてアプリに登録

使い方（frontend フォルダで実行）:
  pip install google-genai pillow
  gcloud auth application-default login          # Vertex AI を使うための認証
  python tools/make_stamp_art.py --project あなたのGCPプロジェクトID --photos tools/photos

  # 一部の駅だけ作り直す / 候補を3枚ずつ作って選ぶ
  python tools/make_stamp_art.py --project ... --photos tools/photos --only osaka kyoto --variants 3

  # Gemini のアプリや AI Studio で手作業で作った線画を取り込むだけ（API 不要）
  #   tools/raw/{駅ID}.png に置いてから:
  python tools/make_stamp_art.py --from-raw

  # 登録ファイル（stampArt.js）だけ作り直す（位置調整を tools/stamp_frames.json に書いたあとなど）
  python tools/make_stamp_art.py --register-only

写真について：自分たちで撮った写真か、使ってよいと決まっている写真を使うこと。
"""
import argparse
import json
import re
import sys
import time
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
FRONT = HERE.parent
LINES_JS = FRONT / "js" / "data" / "lines.js"
ART_JS = FRONT / "js" / "data" / "stampArt.js"
OUT_DIR = FRONT / "assets" / "stamps"
RAW_DIR = HERE / "raw"
FRAMES_JSON = HERE / "stamp_frames.json"
PHOTO_EXT = (".jpg", ".jpeg", ".png", ".webp")

# ---- プロンプト -------------------------------------------------------------

DESCRIBE_PROMPT = """You are helping make a round rubber stamp for {name} Station (Japan).
Look at the attached photo and answer in JSON only, with these keys:
- "landmark_name": short English name of the main subject in the photo
- "signature_feature": one English sentence describing the most recognizable
  shape that must be kept (outline, silhouette, distinctive structure)
- "shadow_area": a short English phrase naming the largest dark/shadowed area
  that should be filled solid black (or "none")
"""

DRAW_PROMPT = """Redraw the attached photo as a bold black-and-white line illustration
for a round rubber stamp of {landmark_name}.

KEEP (do not change):
- The exact composition, camera angle, and perspective of the photo.
- The outer silhouette and main contours of every major structure,
  traced from the photo. Do not move, add, or remove any structure.
- The signature feature: {signature_feature}.

SIMPLIFY (deform slightly, like a hand-drawn station stamp):
- Reduce repetitive details to a few representative lines
  (e.g. draw about 1/3 of the truss members, a few window rows).
- Slightly exaggerate the signature feature so it reads at small size.
- Smooth small irregularities, but keep each contour where it is.

STYLE:
- Pure black ink on pure white. No gray, no gradients, no color.
- Thick outer contours, thinner inner lines. Minimum line width
  must stay readable when the image is shrunk to 80 px.
- Fill large shadowed areas with solid black ({shadow_area}),
  and show structure inside them as white lines.
- Leave the sky plain white.

REMOVE:
- All text, letters, numbers, signs, logos, and brand marks.
- People, cars, overhead wires, and small clutter.

OUTPUT: square image, subject centered, edges may be cropped.
"""

# ---- 駅リスト（lines.js から読む） ------------------------------------------

def load_stations():
    src = LINES_JS.read_text(encoding="utf-8")
    seen, out = set(), []
    for m in re.finditer(r'\bs\("([^"]+)",\s*"([^"]+)",\s*"([^"]+)",\s*"([^"]+)"\)', src):
        sid, name, _kana, romaji = m.groups()
        if sid not in seen:
            seen.add(sid)
            out.append({"id": sid, "name": name, "romaji": romaji})
    return out

# ---- 線画 → スタンプ用マスク -------------------------------------------------

def to_stamp_mask(img: Image.Image, size=600) -> Image.Image:
    """白黒の線画を「白い線／黒い背景」の正方形 PNG に変換（アプリ側でこれをマスクにして色を塗る）"""
    g = ImageOps.exif_transpose(img).convert("L")
    w, h = g.size
    side = min(w, h)  # 正方形に切り抜き（中央）
    g = g.crop(((w - side) // 2, (h - side) // 2, (w + side) // 2, (h + side) // 2))
    g = g.resize((size, size), Image.LANCZOS)
    return g.point(lambda v: 255 if v < 128 else 0)  # 黒い線 → 白、白い背景 → 黒

# ---- Gemini（Vertex AI） ----------------------------------------------------

def make_client(project, location):
    try:
        from google import genai
    except ImportError:
        sys.exit("google-genai が入っていません: pip install google-genai")
    return genai.Client(vertexai=True, project=project, location=location)


def describe(client, model, photo_bytes, mime, name):
    from google.genai import types
    resp = client.models.generate_content(
        model=model,
        contents=[types.Part.from_bytes(data=photo_bytes, mime_type=mime), DESCRIBE_PROMPT.format(name=name)],
        config=types.GenerateContentConfig(response_mime_type="application/json", temperature=0.2),
    )
    data = json.loads(resp.text)
    return {
        "landmark_name": data.get("landmark_name") or f"{name} Station",
        "signature_feature": data.get("signature_feature") or "the overall silhouette of the main building",
        "shadow_area": data.get("shadow_area") or "none",
    }


def draw(client, model, photo_bytes, mime, info):
    from google.genai import types
    resp = client.models.generate_content(
        model=model,
        contents=[types.Part.from_bytes(data=photo_bytes, mime_type=mime), DRAW_PROMPT.format(**info)],
        config=types.GenerateContentConfig(response_modalities=["TEXT", "IMAGE"]),
    )
    for cand in resp.candidates or []:
        for part in cand.content.parts or []:
            if getattr(part, "inline_data", None) and part.inline_data.data:
                return part.inline_data.data
    raise RuntimeError("画像が返ってきませんでした（安全フィルタで止められた可能性があります）")

# ---- 登録ファイル（stampArt.js）の書き出し -----------------------------------

def auto_frame(png: Path):
    """絵の主役が円の中に収まる位置と大きさを自動で決める
    （雲などの小さいものは無視して、線が多く集まる行を「主役の上端」とみなす）"""
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    top = 0
    for y in range(h):
        if sum(1 for x in range(0, w, 2) if px[x, y] > 128) / (w / 2) > 0.15:
            top = y / h
            break
    size = 220 if top >= 0.25 else 205       # 上まで描かれている絵は少し小さく
    y = round(48 - top * size)               # 主役の上端がスタンプの y=48 あたりに来るように
    return {"y": max(-70, min(20, y)), "size": size}


def register():
    frames = json.loads(FRAMES_JSON.read_text(encoding="utf-8")) if FRAMES_JSON.exists() else {}
    ids = sorted(p.stem for p in OUT_DIR.glob("*.png"))
    lines = []
    for sid in ids:
        f = {**auto_frame(OUT_DIR / f"{sid}.png"), **frames.get(sid, {})}  # 手動の指定があれば優先
        opts = [f'src: "assets/stamps/{sid}.png"', f'y: {f["y"]}', f'size: {f["size"]}']
        if "x" in f: opts.append(f'x: {f["x"]}')
        lines.append(f'  "{sid}": {{ {", ".join(opts)} }},')
    ART_JS.write_text(
        "// 駅スタンプの線画（アプリに組み込む画像の一覧）\n"
        "// - 画像：assets/stamps/{駅ID}.png（正方形・白い線／黒い背景）\n"
        "// - y：絵を上下にずらす量（スタンプの座標 240×240 で。マイナスで上へ）\n"
        "// - size：絵の大きさ（標準 220）\n"
        "// ※ tools/make_stamp_art.py を実行すると、このファイルは自動で書き換わります。\n"
        "//   自動の位置が気に入らない駅は tools/stamp_frames.json に {\"駅ID\": {\"y\": -10}} のように書いて --register-only。\n"
        "export const STAMP_ART = {\n" + "\n".join(lines) + "\n};\n",
        encoding="utf-8",
    )
    print(f"登録: {len(ids)} 駅 → {ART_JS.relative_to(FRONT)}")

# ---- メイン -----------------------------------------------------------------

def find_photo(folder: Path, sid: str):
    for ext in PHOTO_EXT:
        p = folder / f"{sid}{ext}"
        if p.exists():
            return p
    return None


def main():
    ap = argparse.ArgumentParser(description="駅スタンプの線画を一括生成")
    ap.add_argument("--project", help="GCP プロジェクトID（Vertex AI）")
    ap.add_argument("--location", default="us-central1")
    ap.add_argument("--photos", type=Path, default=HERE / "photos", help="写真フォルダ（{駅ID}.jpg）")
    ap.add_argument("--only", nargs="*", help="この駅IDだけ処理")
    ap.add_argument("--variants", type=int, default=1, help="1駅あたりの候補数（2以上なら tools/candidates に保存して選ぶ）")
    ap.add_argument("--force", action="store_true", help="すでに画像がある駅も作り直す")
    ap.add_argument("--image-model", default="gemini-2.5-flash-image")
    ap.add_argument("--text-model", default="gemini-2.5-flash")
    ap.add_argument("--from-raw", action="store_true", help="tools/raw/{駅ID}.png の線画を変換して登録するだけ（API不要）")
    ap.add_argument("--register-only", action="store_true", help="stampArt.js の書き出しだけ")
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stations = load_stations()
    if args.only:
        stations = [s for s in stations if s["id"] in set(args.only)]

    if args.register_only:
        register()
        return

    if args.from_raw:
        n = 0
        for s in stations:
            raw = find_photo(RAW_DIR, s["id"])
            if raw:
                to_stamp_mask(Image.open(raw)).save(OUT_DIR / f"{s['id']}.png", optimize=True)
                print(f"取り込み: {s['name']} ← {raw.name}")
                n += 1
        print(f"{n} 駅を取り込みました")
        register()
        return

    if not args.project:
        sys.exit("--project（GCP プロジェクトID）を指定してください")
    client = make_client(args.project, args.location)
    cand_dir = HERE / "candidates"
    log = {}

    for s in stations:
        sid, name = s["id"], s["name"]
        out = OUT_DIR / f"{sid}.png"
        if out.exists() and not args.force and args.variants == 1:
            print(f"スキップ（作成済み）: {name}")
            continue
        photo = find_photo(args.photos, sid)
        if not photo:
            print(f"写真なし: {name}（{args.photos / (sid + '.jpg')} を置いてください）")
            continue
        mime = "image/png" if photo.suffix == ".png" else "image/webp" if photo.suffix == ".webp" else "image/jpeg"
        data = photo.read_bytes()
        try:
            info = describe(client, args.text_model, data, mime, name)
            print(f"{name}: {info['signature_feature']}")
            for k in range(args.variants):
                img_bytes = draw(client, args.image_model, data, mime, info)
                RAW_DIR.mkdir(exist_ok=True)
                if args.variants == 1:
                    (RAW_DIR / f"{sid}.png").write_bytes(img_bytes)
                    import io
                    to_stamp_mask(Image.open(io.BytesIO(img_bytes))).save(out, optimize=True)
                else:
                    cand_dir.mkdir(exist_ok=True)
                    (cand_dir / f"{sid}_{k + 1}.png").write_bytes(img_bytes)
                time.sleep(1)  # レート制限よけ
            log[sid] = info
        except Exception as e:  # 1駅失敗しても続ける
            print(f"失敗: {name}: {e}")

    (HERE / "stamp_prompts_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.variants > 1:
        print(f"候補を {cand_dir} に保存しました。良いものを tools/raw/{{駅ID}}.png にコピーして --from-raw を実行してください。")
    register()


if __name__ == "__main__":
    main()
