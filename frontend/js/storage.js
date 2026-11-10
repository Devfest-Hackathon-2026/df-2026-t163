// localStorage に進行状況を保存する（ログイン無し）
const KEY = "teikiSugoroku:v1";

const DEFAULT_STATE = {
  settings: {
    lineId: "jr-kyoto-kobe",
    direction: 1, // 1 = 降車駅の方向, -1 = 乗車駅の方向
    muted: false,
  },
  // stationId -> { lineId, missions[9], opened{idx:{at,method,comment,thumb}}, bingoLines[], exploredAt, perfectAt, source, generatedAt, params }
  stations: {},
  // 今プレイ中のビンゴ
  active: null, // { lineId, stationId }
  // 定期区間 { id, name, section, color, legs[], stations[] }（最初の画面で選ぶ）
  route: null,
  // 盤面上のコマの位置
  piece: null, // { lineId, stationId }
};

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings ?? {}) },
      stations: parsed.stations ?? {},
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.warn("[storage] save failed", e);
    return false;
  }
}

export function save() {
  if (persist()) return true;
  // 容量オーバー時は、共有保存から取り直せる線画を古い駅から手放す（登録した写真は消さない）
  for (const st of Object.values(state.stations)) {
    if (!st.stampArt) continue;
    delete st.stampArt;
    if (persist()) return true;
  }
  return false;
}

export const getState = () => state;
export const getSettings = () => state.settings;

export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export const getStationProgress = (stationId) => state.stations[stationId] ?? null;

export function setStationProgress(stationId, progress) {
  state.stations[stationId] = progress;
  return save();
}

export const getRoute = () => state.route;

export function setRoute(route) {
  state.route = route;
  save();
}

export function setActive(active) {
  state.active = active;
  save();
}

export function setPiece(piece) {
  state.piece = piece;
  save();
}

export function resetAll() {
  try { localStorage.removeItem(KEY); } catch {}
  state = structuredClone(DEFAULT_STATE);
}
