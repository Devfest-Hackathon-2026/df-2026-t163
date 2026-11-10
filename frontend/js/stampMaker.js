// 駅スタンプの線画をその場で作る：画像モデルの白黒イラスト → 「白い線／黒い背景」の小さなマスク画像
import { generateStampArt } from "./api.js";
import { CONFIG } from "./config.js";
import { getStationProgress, setStationProgress } from "./storage.js";
import { hasStampArt, stampMotifFor } from "./stamp.js";

const MASK_PX = 320;
const inFlight = new Set();

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function toMask(base64, mimeType) {
  const img = await loadImage(`data:${mimeType};base64,${base64}`);
  const cv = document.createElement("canvas");
  cv.width = cv.height = MASK_PX;
  const c = cv.getContext("2d", { willReadFrequently: true });
  c.drawImage(img, 0, 0, MASK_PX, MASK_PX);
  const image = c.getImageData(0, 0, MASK_PX, MASK_PX);
  const px = image.data;
  const lum = (i) => (px[i] + px[i + 1] + px[i + 2]) / 3;
  // 背景は四辺の明るさで判定する（モデルが白黒を逆に描いても使えるように）
  let edge = 0;
  for (let k = 0; k < MASK_PX; k++) {
    edge += lum(k * 4) + lum((MASK_PX * (MASK_PX - 1) + k) * 4) + lum(k * MASK_PX * 4) + lum((k * MASK_PX + MASK_PX - 1) * 4);
  }
  const lightBackground = edge / (MASK_PX * 4) > 127;
  for (let i = 0; i < px.length; i += 4) {
    const line = lightBackground ? lum(i) < 128 : lum(i) >= 128;
    px[i] = px[i + 1] = px[i + 2] = line ? 255 : 0;
    px[i + 3] = 255;
  }
  c.putImageData(image, 0, 0);
  return { src: cv.toDataURL("image/png"), ...frameFor(px) };
}

// 主役が円の中に収まる位置と大きさ（tools/make_stamp_art.py の auto_frame と同じ考え方）
function frameFor(px) {
  let top = 0;
  for (let y = 0; y < MASK_PX; y++) {
    let lines = 0;
    for (let x = 0; x < MASK_PX; x += 2) if (px[(y * MASK_PX + x) * 4] > 128) lines++;
    if (lines / (MASK_PX / 2) > 0.15) { top = y / MASK_PX; break; }
  }
  const size = top >= 0.25 ? 220 : 205;
  return { size, y: Math.max(-70, Math.min(20, Math.round(48 - top * size))) };
}

/** まだ線画が無い駅の線画を裏で作り、できたら保存して onReady を呼ぶ */
export async function ensureStampArt(station, progress, onReady) {
  if (CONFIG.MODE === "mock" || station.lat == null || progress.stampArt || hasStampArt(station.id) || inFlight.has(station.id)) return;
  inFlight.add(station.id);
  try {
    const motif = stampMotifFor(progress);
    const res = await generateStampArt({ station, landmark: motif.label, category: motif.category });
    const art = await toMask(res.imageBase64, res.mimeType);
    const latest = getStationProgress(station.id);
    if (latest) {
      latest.stampArt = art;
      setStationProgress(station.id, latest);
      onReady?.();
    }
  } catch (e) {
    // 失敗してもモチーフのアイコンのスタンプが出る。次のマス達成でまた試す
    console.warn("[stamp] art generation failed:", e);
  } finally {
    inFlight.delete(station.id);
  }
}
