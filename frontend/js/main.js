import {
  getState, getSettings, updateSettings, getStationProgress, setStationProgress,
  setActive, setPiece, resetAll, getRoute, setRoute,
} from "./storage.js";
import { Board, computePath } from "./board.js";
import { createDice } from "./dice.js";
import { BingoScreen } from "./bingo.js";
import { renderStampBook } from "./stamps.js";
import { RoutePicker, fillRouteDetails, lineColorOf } from "./route.js";
import { fetchMissions } from "./api.js";
import { sfx } from "./sound.js";
import { toast, wait } from "./effects.js";
import { CONFIG } from "./config.js";

const $ = (sel) => document.querySelector(sel);

const els = {
  boardScreen: $("#screen-board"),
  bingoScreen: $("#screen-bingo"),
  stampsScreen: $("#screen-stamps"),
  routeScreen: $("#screen-route"),
  routeLegend: $("#route-legend"),
  dirBtns: $("#seg-dir"),
  board: $("#board"),
  counter: $("#counter"),
  roll: $("#btn-roll"),
  dockMsg: $("#dock-msg"),
  dockResult: $("#dock-result"),
  mute: $("#btn-mute"),
  menu: $("#btn-menu"),
  menuSheet: $("#menu-sheet"),
  resume: $("#resume-banner"),
  loading: $("#loading"),
};

let rolling = false;
let landed = null; // 直近で止まった駅
let pendingPaint = null;

const board = new Board(els.board, { onCellTap: onBoardCellTap });
const dice = createDice($("#dice-host"));
const bingo = new BingoScreen(els.bingoScreen, {
  onBack: () => goBoard(),
  onExplored: (station) => {
    pendingPaint = station.id;
    goBoard();
  },
  onRegenerate: (station) => startBingo(station, { regenerate: true }),
  onStampArt: () => board.refresh(),
});
const routePicker = new RoutePicker(els.routeScreen, {
  onDone: applyRoute,
  onCancel: () => history.back(),
});

// ===== 初期化 =====
function init() {
  $("#btn-pass-edit").addEventListener("click", () => { closeMenu(); openRoutePicker(); });
  $("#btn-piece-home").addEventListener("click", () => {
    setPiece(null);
    resetDock();
    renderSetup();
    closeMenu();
    toast("コマを乗車駅に戻しました");
  });
  els.dirBtns.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    sfx.tap();
    updateSettings({ direction: +b.dataset.v });
    renderSetup(false);
  });
  els.roll.addEventListener("click", () => roll());
  els.mute.addEventListener("click", () => {
    updateSettings({ muted: !getSettings().muted });
    renderMute();
  });
  els.menu.addEventListener("click", openMenu);
  els.counter.addEventListener("click", openStamps);
  els.menuSheet.addEventListener("click", (e) => {
    if (e.target === els.menuSheet || e.target.closest("[data-close]")) closeMenu();
  });
  $("#btn-reset").addEventListener("click", onReset);

  addEventListener("popstate", () => {
    if (!els.routeScreen.hidden) closeRoutePicker();
    else if (!els.stampsScreen.hidden) closeStamps();
    else if (!els.bingoScreen.hidden) showBoardScreen();
  });
  if (["#bingo", "#stamps", "#route"].includes(location.hash)) history.replaceState(null, "", location.pathname + location.search);

  renderMute();
  if (getRoute()) {
    renderSetup();
    colorizeOlderRoute(getRoute());
    prepareBoardingBingo();
  } else {
    showFirstRoutePicker();
  }
  if (CONFIG.MODE === "mock") toast("デモモード：バックエンドを使わずに動いています");
}

function bindSegment(host, key, cast) {
  host.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    sfx.tap();
    updateSettings({ [key]: cast(b.dataset.v) });
    renderSegments();
  });
}

function renderSegments() {
  const s = getSettings();
  const mark = (host, val) => host.querySelectorAll("button[data-v]").forEach((b) => {
    const on = b.dataset.v === String(val);
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
  });
  mark(els.dirBtns, s.direction);
}

function renderSetup(rebuildBoard = true) {
  const route = getRoute();
  const first = route.stations[0], last = route.stations.at(-1);
  renderRouteLegend(route);
  els.dirBtns.innerHTML = `
    <button type="button" data-v="-1" aria-label="${escHtml(first.name)}方面">◀ ${escHtml(first.name)}方面</button>
    <button type="button" data-v="1" aria-label="${escHtml(last.name)}方面">${escHtml(last.name)}方面 ▶</button>`;
  renderSegments();
  if (rebuildBoard) {
    const piece = getState().piece;
    const pieceId = piece?.lineId === route.id && route.stations.some((st) => st.id === piece.stationId) ? piece.stationId : first.id;
    board.render(route, first.id, pieceId);
  }
  renderCounter();
  renderResume();
}

function renderCounter() {
  const route = getRoute();
  const n = route.stations.filter((st) => getStationProgress(st.id)?.exploredAt).length;
  els.counter.innerHTML = `${ICON_STAMP}<span><b>${n}</b>/${route.stations.length}</span>`;
  els.counter.setAttribute("aria-label", `スタンプ帳を開く（${n} / ${route.stations.length} 駅）`);
}

// スタンプ数のアイコン（丸い駅スタンプのイラスト）・音量アイコン
const ICON_STAMP = `<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10" stroke-width="2.6"/><circle cx="12" cy="12" r="7" stroke-width="1.2"/><path d="M8 13.5l2.5-4 2 2.5 1.5-2 2 3.5z" fill="currentColor" stroke-width="1"/><path d="M8.5 15.5h7" stroke-width="1.4"/></svg>`;
const ICON_SOUND_ON = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6"/><path d="M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`;
const ICON_SOUND_OFF = `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>`;

function renderMute() {
  const m = getSettings().muted;
  els.mute.innerHTML = m ? ICON_SOUND_OFF : ICON_SOUND_ON;
  els.mute.classList.toggle("is-muted", m);
  els.mute.setAttribute("aria-label", m ? "効果音をオンにする" : "効果音をオフにする");
  els.mute.setAttribute("aria-pressed", String(m));
}

function renderResume() {
  const a = getState().active;
  const line = getRoute();
  const st = a && line.stations.find((x) => x.id === a.stationId);
  const p = st && getStationProgress(st.id);
  if (!p || p.perfectAt) { els.resume.hidden = true; return; }
  const n = Object.keys(p.opened).length;
  els.resume.hidden = false;
  els.resume.innerHTML = `<button type="button" class="resume-btn">▶ <b>${escHtml(st.name)}駅</b>のビンゴが進行中（${n}/9）<span>続きへ</span></button>`;
  els.resume.querySelector("button").onclick = () => startBingo(st);
}

function resetDock() {
  landed = null;
  rollOrigin = null;
  els.dockResult.hidden = true;
  els.roll.hidden = false;
  els.dockMsg.textContent = "コマのいる駅から、出た目の数だけ進むよ";
  board.clearSpotlight();
}

// ===== サイコロ =====
// コマは「前回止まった駅」から進む（すごろく方式）。出発駅はコマの最初の位置。
let rollOrigin = null; // 振り直し用：今回振る前の { idx, dir }

function currentPieceIdx(line) {
  const piece = getState().piece;
  const idx = piece?.lineId === line.id ? line.stations.findIndex((st) => st.id === piece.stationId) : -1;
  return idx >= 0 ? idx : 0; // コマが無ければ乗車駅（区間の先頭）から
}

async function roll({ reroll = false } = {}) {
  if (rolling) return;
  rolling = true;
  sfx.unlock();
  const s = getSettings();
  const line = getRoute();

  // 振り直しは「振る前の駅・向き」からやり直す（余分に進めないように）
  let fromIdx, dir;
  if (reroll && rollOrigin) {
    ({ idx: fromIdx, dir } = rollOrigin);
    if (dir !== s.direction) { updateSettings({ direction: dir }); renderSegments(); }
  } else {
    fromIdx = currentPieceIdx(line);
    dir = s.direction;
    rollOrigin = { idx: fromIdx, dir };
  }

  els.roll.disabled = true;
  els.dockResult.hidden = true;
  els.roll.hidden = false;
  board.clearSpotlight();
  els.dockMsg.textContent = "コロコロ…";
  document.body.classList.add("is-rolling");

  await board.warpTo(fromIdx);
  const n = await dice.roll();
  els.dockMsg.innerHTML = `<b class="big-num">${n}</b> が出た！ ${n}駅すすむ`;
  await wait(250);
  const path = computePath(fromIdx, dir, n, line.stations.length);
  await board.hopPath(path);
  const landIdx = path.at(-1);
  const prevIdx = path.length >= 2 ? path.at(-2) : fromIdx;
  const finalDir = Math.sign(landIdx - prevIdx) || dir;
  const st = line.stations[landIdx];
  setPiece({ lineId: line.id, stationId: st.id });

  // 終点で折り返したら、次からはその向きで進む
  const turned = finalDir !== dir;
  if (turned) {
    updateSettings({ direction: finalDir });
    renderSegments();
  }
  document.body.classList.remove("is-rolling");
  els.roll.disabled = false;
  rolling = false;

  if (landIdx === fromIdx) {
    sfx.fail();
    rollOrigin = null;
    els.dockMsg.textContent = "折り返して元の駅に戻ってきた！もう一回振れるよ 🎲";
    return;
  }
  sfx.arrive();
  board.spotlight(landIdx);
  landed = st;
  showLanded(st);
  if (turned) {
    const end = finalDir > 0 ? line.stations.at(-1) : line.stations[0];
    toast(`定期区間の端で折り返し！ここからは${end.name}方面に進むよ`);
  }
}

function showLanded(st) {
  const p = getStationProgress(st.id);
  const label = p ? (p.perfectAt ? "もう一度見る" : "続きから") : "ビンゴ開始！";
  els.roll.hidden = true;
  els.dockMsg.innerHTML = `<span class="land-kana">${escHtml(st.kana)}</span><span class="land-name">${escHtml(st.name)}</span>駅に到着！${p?.exploredAt ? '<span class="land-tag">スタンプ済</span>' : ""}`;
  els.dockResult.hidden = false;
  els.dockResult.innerHTML = `
    <button type="button" class="btn-primary" data-act="go">${label}</button>
    <button type="button" class="btn-ghost" data-act="reroll">🎲 振り直す</button>`;
  els.dockResult.querySelector('[data-act="go"]').onclick = () => startBingo(st);
  els.dockResult.querySelector('[data-act="reroll"]').onclick = () => roll({ reroll: true });
}

function onBoardCellTap(st, i) {
  if (rolling) return;
  const p = getStationProgress(st.id);
  sfx.tap();
  if (p) {
    startBingo(st);
    return;
  }
  // 乗車駅のビンゴは最初から遊べる（用意が間に合っていなければここで作る）
  if (i === 0) {
    startBingo(st);
    return;
  }
  // 未開拓の駅：どの駅を押したか分かるように、黄色い波を広げる
  board.spotlight(i);
  toast(`${st.name}はまだ未開拓。サイコロで止まったら挑戦できるよ`);
}

// ===== ビンゴ開始 =====
const LOADING_MSGS = [
  "駅前を偵察中…",
  "Googleマップで実在するスポットを確認中…",
  "Gemini がミッションを考え中…",
  "ビンゴカードを印刷中…",
];

// 同じ駅のビンゴを二重に作らない（乗車駅の事前準備と、タップが重なったときなど）
const bingoJobs = new Map();

function createBingo(station) {
  if (bingoJobs.has(station.id)) return bingoJobs.get(station.id);
  const job = (async () => {
    const line = getRoute();
    const prev = getStationProgress(station.id);
    const res = await fetchMissions({ line, station });
    setStationProgress(station.id, {
      lineId: line.id,
      missions: res.missions,
      stamp: res.stamp ?? prev?.stamp ?? null,
      stampMotif: prev?.stampMotif ?? null,
      stampArt: prev?.stampArt ?? null,
      station: { name: station.name, lineName: station.lineName ?? line.name },
      opened: {},
      bingoLines: [],
      exploredAt: prev?.exploredAt ?? null,
      perfectAt: null,
      source: res.source,
      generatedAt: Date.now(),
    });
    if (res.source === "mock" && CONFIG.MODE !== "mock") toast("バックエンドに繋がらないのでデモデータで表示中");
  })().finally(() => bingoJobs.delete(station.id));
  bingoJobs.set(station.id, job);
  return job;
}

// 乗車駅のビンゴは、サイコロを振らなくても遊べるように先に作っておく
async function prepareBoardingBingo() {
  const route = getRoute();
  const station = route.stations[0];
  if (getStationProgress(station.id)) return;
  try {
    await createBingo(station);
  } catch (e) {
    console.warn("[bingo] boarding station not prepared:", e); // タップしたときにもう一度作る
    return;
  }
  if (getRoute()?.id !== route.id) return;
  if (!getState().active) setActive({ lineId: route.id, stationId: station.id });
  board.refresh();
  renderResume();
}

async function startBingo(station, { regenerate = false } = {}) {
  const line = getRoute();
  if (!getStationProgress(station.id) || regenerate) {
    showLoading(station);
    try {
      await createBingo(station);
    } catch (e) {
      console.error(e);
      hideLoading();
      toast("ミッションの生成に失敗しました。もう一度試してね");
      return;
    }
    hideLoading();
  }

  setActive({ lineId: line.id, stationId: station.id });
  bingo.show(line, station);
  showBingoScreen();
}

let loadingTimer = null;
function showLoading(station) {
  els.loading.querySelector(".loading-station").textContent = `${station.name}駅`;
  const msg = els.loading.querySelector(".loading-msg");
  let i = 0;
  msg.textContent = LOADING_MSGS[0];
  clearInterval(loadingTimer);
  loadingTimer = setInterval(() => { i = (i + 1) % LOADING_MSGS.length; msg.textContent = LOADING_MSGS[i]; }, 1500);
  els.loading.hidden = false;
}
function hideLoading() {
  clearInterval(loadingTimer);
  els.loading.hidden = true;
}

// ===== 画面切替 =====
function showBingoScreen() {
  els.boardScreen.hidden = true;
  els.bingoScreen.hidden = false;
  scrollTo({ top: 0 });
  if (location.hash !== "#bingo") history.pushState({ screen: "bingo" }, "", "#bingo");
}

function goBoard() {
  if (location.hash === "#bingo") history.back(); // popstate → showBoardScreen
  else showBoardScreen();
}

async function showBoardScreen() {
  els.bingoScreen.hidden = true;
  els.boardScreen.hidden = false;
  resetDock();
  board.holdId = pendingPaint; // ハンコを押すまでスタンプは見せない
  board.refresh();
  renderCounter();
  renderResume();
  if (pendingPaint) {
    const id = pendingPaint;
    pendingPaint = null;
    await wait(200);
    await board.paint(id);
    renderCounter();
    const st = getRoute().stations.find((x) => x.id === id);
    if (st) toast(`💮 ${st.name}駅のスタンプをゲット！`);
  }
}

// ===== 定期区間えらび =====
const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// どこまでがどの路線で、どこで乗り換えるかの凡例
function renderRouteLegend(route) {
  els.routeLegend.innerHTML = route.legs.map((leg, i) => {
    const next = route.legs[i + 1];
    const transfer = !next ? "" : next.from === leg.to
      ? `<li class="legend-transfer">⇄ ${escHtml(leg.to)}で乗り換え</li>`
      : `<li class="legend-transfer">🚶 ${escHtml(leg.to)} → ${escHtml(next.from)}（歩いて乗り換え）</li>`;
    return `
      <li><i style="background:${escHtml(lineColorOf(route, leg.line))}"></i><b>${escHtml(leg.line)}</b><span>${escHtml(leg.from)} → ${escHtml(leg.to)}</span></li>
      ${transfer}`;
  }).join("");
}

// 色の機能より前に選んだ区間にも色を付ける
async function colorizeOlderRoute(route) {
  if (route.lineColors) return;
  await fillRouteDetails(route);
  if (getRoute() !== route) return;
  setRoute(route);
  renderSetup();
}

function showFirstRoutePicker() {
  els.boardScreen.hidden = true;
  els.routeScreen.hidden = false;
  routePicker.show({ canCancel: false });
}

function openRoutePicker() {
  if (rolling) return;
  sfx.tap();
  boardScrollY = scrollY;
  els.boardScreen.hidden = true;
  els.routeScreen.hidden = false;
  routePicker.show({ canCancel: true, route: getRoute() });
  scrollTo({ top: 0 });
  history.pushState({ screen: "route" }, "", "#route");
}

function closeRoutePicker() {
  els.routeScreen.hidden = true;
  els.boardScreen.hidden = false;
  scrollTo({ top: boardScrollY });
}

function applyRoute(route) {
  if (getRoute()?.id === route.id) {
    if (location.hash === "#route") history.replaceState(null, "", location.pathname + location.search);
    closeRoutePicker();
    toast("定期区間はそのままです");
    return;
  }
  setRoute(route);
  setPiece(null);
  setActive(null);
  updateSettings({ direction: 1 });
  if (location.hash === "#route") history.replaceState(null, "", location.pathname + location.search);
  els.routeScreen.hidden = true;
  els.boardScreen.hidden = false;
  resetDock();
  renderSetup();
  scrollTo({ top: 0 });
  sfx.unlock();
  sfx.arrive();
  toast(`${route.stations[0].name}〜${route.stations.at(-1).name}の台紙ができたよ！`);
  prepareBoardingBingo();
}

// ===== スタンプ帳 =====
// サイコロの出目や到着中の表示を消さないよう、路線図の状態には触らず重ねて開く
let boardScrollY = 0;

function openStamps() {
  if (rolling) return;
  sfx.tap();
  boardScrollY = scrollY;
  renderStampBook(els.stampsScreen, { onBack: () => history.back() });
  els.boardScreen.hidden = true;
  els.stampsScreen.hidden = false;
  scrollTo({ top: 0 });
  history.pushState({ screen: "stamps" }, "", "#stamps");
}

function closeStamps() {
  els.stampsScreen.hidden = true;
  els.boardScreen.hidden = false;
  scrollTo({ top: boardScrollY });
}

// ===== メニュー =====
let resetArmed = false;
function openMenu() {
  resetArmed = false;
  $("#btn-reset").textContent = "進行状況をリセット";
  $("#mode-info").textContent =
    CONFIG.MODE === "mock" ? "デモモード（バックエンド未使用）"
    : `API: ${CONFIG.API_BASE_URL || location.origin}（失敗時はデモデータ）`;
  els.menuSheet.hidden = false;
  requestAnimationFrame(() => els.menuSheet.classList.add("open"));
}
function closeMenu() {
  els.menuSheet.classList.remove("open");
  setTimeout(() => { els.menuSheet.hidden = true; }, 220);
}
function onReset() {
  if (!resetArmed) {
    resetArmed = true;
    $("#btn-reset").textContent = "本当にリセット？もう一度タップ";
    return;
  }
  resetAll();
  closeMenu();
  resetDock();
  renderMute();
  showFirstRoutePicker();
  toast("リセットしました");
}

init();
