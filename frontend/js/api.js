// バックエンド API クライアント ＋ デモ用モック
// 契約の詳細は frontend/API_CONTRACT.md を参照
import { CONFIG } from "./config.js";
import { LINES } from "./data/lines.js";

export const CATEGORY_ICONS = {
  food: "🍜", cafe: "☕", sweets: "🍰", bakery: "🥐", park: "🌳", shrine: "⛩️",
  shop: "🛍️", view: "📸", culture: "🏛️", bench: "🪑", other: "✨", station: "🚉",
};

const CATEGORIES = Object.keys(CATEGORY_ICONS);

// スポットを探す範囲（60 分 → 徒歩 10 分圏）
const SEARCH_MINUTES = 60;

// カテゴリごとの滞在時間の目安（分）
const STAY_MINUTES = { food: 25, cafe: 20, sweets: 10, bakery: 10, park: 10, shrine: 10, shop: 15, view: 5, culture: 20, bench: 5, other: 10 };

/** ミッションの所要時間の目安（往復の徒歩＋滞在）。FREE マスなど歩かないものは 0 */
export function missionMinutes(m) {
  if (m.isFree) return 0;
  const raw = (m.walkMinutes ?? 0) * 2 + (STAY_MINUTES[m.category] ?? 10);
  return Math.max(5, Math.ceil(raw / 5) * 5);
}

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("timeout", "TimeoutError")), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function postJson(path, body, timeoutMs) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: t.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    t.done();
  }
}

async function getJson(path, timeoutMs = 15000) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${CONFIG.API_BASE_URL}${path}`, { signal: t.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    t.done();
  }
}

// ===== 路線・駅データ（デモモードでは内蔵の JR 2 路線だけ）=====
const mockStations = (line) => {
  const list = LINES.find((l) => l.name === line)?.stations ?? [];
  return list.map((st, i) => ({
    name: st.name, line, prefecture: "", lat: null, lng: null, prev: list[i - 1]?.name ?? null, next: list[i + 1]?.name ?? null,
  }));
};

export const fetchRailLines = (prefecture) => (CONFIG.MODE === "mock"
  ? Promise.resolve(LINES.map((l) => l.name))
  : getJson(`/api/rail/lines?prefecture=${encodeURIComponent(prefecture)}`));

export const fetchRailStations = (line) => (CONFIG.MODE === "mock"
  ? Promise.resolve(mockStations(line))
  : getJson(`/api/rail/stations?line=${encodeURIComponent(line)}`));

export const fetchNearbyStations = (lat, lng) => getJson(`/api/rail/nearby?lat=${lat}&lng=${lng}`);

/** @returns {Promise<{readings: Record<string, {kana: string, romaji: string}>, lineColors: Record<string, string>}>} */
export async function fetchRouteDetails(names, lines) {
  if (CONFIG.MODE === "mock") return { readings: {}, lineColors: {} };
  const data = await postJson("/api/rail/readings", { names, lines }, 30000);
  return {
    readings: Object.fromEntries(data.readings.map((r) => [r.name, { kana: r.kana, romaji: r.romaji }])),
    lineColors: Object.fromEntries(data.lineColors.map((c) => [c.line, c.color])),
  };
}

export const generateStampArt = ({ station, landmark, category }) =>
  postJson("/api/stamp-art", { stationName: station.name, lat: station.lat, lng: station.lng, landmark, category }, 60000);

export function mapsUrlFor(m, stationName) {
  if (m.mapsUrl && /^https:\/\//.test(m.mapsUrl)) return m.mapsUrl;
  const q = encodeURIComponent(m.spotName ? `${m.spotName}` : `${stationName}駅`);
  const pid = m.placeId ? `&query_place_id=${encodeURIComponent(m.placeId)}` : "";
  return `https://www.google.com/maps/search/?api=1&query=${q}${pid}`;
}

const str = (v, max, fallback = "") =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : fallback;

// バックエンドの JSON が多少崩れていても画面が壊れないように整形する
function normalizeMission(raw, i, stationName) {
  const m = raw ?? {};
  const category = CATEGORIES.includes(m.category) ? m.category : "other";
  const walk = Number.isFinite(+m.walkMinutes) ? Math.max(0, Math.min(60, Math.round(+m.walkMinutes))) : null;
  const out = {
    id: str(m.id, 64, `m${i}`),
    title: str(m.title, 40, "ひみつのミッション"),
    description: str(m.description, 200, ""),
    spotName: str(m.spotName, 60, ""),
    category,
    walkMinutes: walk,
    placeId: str(m.placeId, 200, ""),
    mapsUrl: str(m.mapsUrl, 500, ""),
    photoHint: str(m.photoHint, 80, ""),
  };
  out.mapsUrl = mapsUrlFor(out, stationName);
  return out;
}

function centerMission(station) {
  return {
    id: "free-center",
    title: `${station.name}駅で途中下車！`,
    description: "改札を出たらタップしてスタンプを押そう。これだけで1マス達成！",
    spotName: `${station.name}駅`,
    category: "station",
    walkMinutes: 0,
    placeId: "",
    mapsUrl: mapsUrlFor({ spotName: `${station.lineName ?? ""} ${station.name}駅`.trim() }, station.name),
    photoHint: "駅名標と一緒に撮ると記念になるよ",
    isFree: true,
  };
}

// バックエンドが「この駅のスタンプの絵柄」を指定してきた場合（任意）
function normalizeStamp(raw) {
  if (!raw || !CATEGORIES.includes(raw.category)) return null;
  return { category: raw.category, label: str(raw.label, 30, "") };
}

// 8 個なら真ん中に FREE を差し込む。9 個ならそのまま使う。
export function buildBoard(rawMissions, station) {
  const list = (Array.isArray(rawMissions) ? rawMissions : []).slice(0, 9)
    .map((m, i) => normalizeMission(m, i, station.name));
  if (list.length >= 9) return list;
  while (list.length < 8) list.push(...mockMissionsRaw(station).slice(list.length, 8));
  const board = list.slice(0, 8).map((m, i) => normalizeMission(m, i, station.name));
  board.splice(4, 0, centerMission(station));
  return board;
}

/**
 * ミッション生成
 * @returns {Promise<{missions: object[], source: "api"|"mock", note?: string}>}
 */
export async function fetchMissions({ line, station }) {
  const req = {
    lineId: line.id,
    lineName: station.lineName ?? line.name,
    stationId: station.id,
    stationName: station.name,
    timeMinutes: SEARCH_MINUTES,
    lat: station.lat,
    lng: station.lng,
  };

  if (CONFIG.MODE !== "mock") {
    try {
      const data = await postJson("/api/missions", req, CONFIG.MISSIONS_TIMEOUT_MS);
      return { missions: buildBoard(data.missions, station), stamp: normalizeStamp(data.stamp), source: "api", note: str(data.note, 120) };
    } catch (e) {
      console.warn("[api] /api/missions failed:", e);
      if (CONFIG.MODE === "api") throw e;
    }
  }
  await sleep(1400); // ローディング演出を見せるための待ち
  return { missions: buildBoard(mockMissionsRaw(station, req), station), stamp: null, source: "mock" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ===== デモデータ =====
// 実在店舗名は捏造しない。Googleマップの「駅名＋ジャンル」検索リンクにしておく。
function mockMissionsRaw(station) {
  const n = station.name;
  const far = 10;
  const pool = [
    { title: "パン屋でひとつ買う", description: `${n}駅の近くのパン屋さんで、気になったパンをひとつ買ってみよう。`, category: "bakery", q: "パン屋", w: 5 },
    { title: "神社かお寺にお参り", description: "駅の近くの神社・お寺を探して、手を合わせてこよう。", category: "shrine", q: "神社", w: far, photoHint: "鳥居か山門を写してね" },
    { title: "公園のベンチで一休み", description: "近くの公園を見つけて、ベンチで3分ぼーっとする。", category: "park", q: "公園", w: Math.min(far, 10) },
    { title: "商店街を端まで歩く", description: "駅前の商店街やアーケードを端から端まで歩いてみよう。", category: "shop", q: "商店街", w: 4 },
    { title: "ご当地っぽいものを食べる", description: `${n}らしい名物や、地元で人気のお店で軽く食べよう。`, category: "food", q: "グルメ", w: 6 },
    { title: "ケーキ屋をのぞく", description: "ショーケースを眺めるだけでもOK。買ったら勝ち。", category: "sweets", q: "ケーキ", w: 7 },
    { title: "駅をいい感じに撮る", description: "駅舎や線路が見える、いちばんエモい角度を探して撮影。", category: "view", q: "駅", w: 2, photoHint: "駅舎か線路を入れて撮ろう" },
    { title: "地元の図書館か資料館へ", description: "近くの図書館・資料館・ミュージアムにふらっと入ってみる。", category: "culture", q: "図書館", w: far },
  ];
  return shuffle(pool).map((p, i) => ({
    id: `mock-${station.id}-${i}`,
    title: p.title,
    description: p.description,
    spotName: `${n}駅周辺の${p.q}`,
    category: p.category,
    walkMinutes: p.w,
    mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${p.q} ${n}駅`)}`,
    photoHint: p.photoHint ?? "",
  }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
