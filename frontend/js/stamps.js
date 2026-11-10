// スタンプ帳：定期区間の駅スタンプの一覧。まだの駅は「？」で表示する
import { LINES, paintColorFor } from "./data/lines.js";
import { getRoute, getState, getStationProgress } from "./storage.js";
import { fmtDate, stampMotifFor, stampSvg, stampTilt } from "./stamp.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function itemHtml(station) {
  const p = getStationProgress(station.id);
  if (!p?.exploredAt) {
    return `
      <li class="sb-item">
        <span class="sb-stamp sb-unknown" aria-hidden="true">?</span>
        <span class="sb-name">${esc(station.name)}</span>
        <span class="sb-sub">未獲得</span>
      </li>`;
  }
  const svg = stampSvg({
    station,
    color: paintColorFor(station.id),
    category: stampMotifFor(p).category,
    date: p.exploredAt,
    perfect: !!p.perfectAt,
    art: p.stampArt,
  });
  return `
    <li class="sb-item got">
      <span class="sb-stamp" style="--tilt:${stampTilt(station.id)}deg">${svg}</span>
      <span class="sb-name">${esc(station.name)}</span>
      <span class="sb-sub">${p.perfectAt ? "★ 完全制覇" : fmtDate(p.exploredAt)}</span>
    </li>`;
}

function sectionHtml(title, stations, { showCount = true } = {}) {
  const got = stations.filter((st) => getStationProgress(st.id)?.exploredAt).length;
  return `
    <section class="sb-line" aria-label="${esc(title)}">
      <div class="sb-line-head">
        <h2 class="sb-line-name">${esc(title)}</h2>
        ${showCount ? `<span class="sb-line-count">${got}/${stations.length}</span>` : ""}
      </div>
      ${showCount ? `<div class="sb-bar" aria-hidden="true"><i style="width:${(got / stations.length) * 100}%"></i></div>` : ""}
      <ul class="sb-grid">${stations.map(itemHtml).join("")}</ul>
    </section>`;
}

// 定期区間を変える前に集めたスタンプ。以前の版の進行状況には駅名が保存されていない
function otherStations(route) {
  const onRoute = new Set(route.stations.map((st) => st.id));
  const legacy = new Map(LINES.flatMap((l) => l.stations).map((st) => [st.id, st]));
  return Object.entries(getState().stations)
    .filter(([id, p]) => p.exploredAt && !onRoute.has(id))
    .map(([id, p]) => ({ id, name: p.station?.name ?? legacy.get(id)?.name ?? id }));
}

export function renderStampBook(root, { onBack }) {
  const route = getRoute();
  const got = route.stations.filter((st) => getStationProgress(st.id)?.exploredAt).length;
  const others = otherStations(route);
  root.innerHTML = `
    <header class="sb-top">
      <button class="btn-ghost" data-act="back" type="button">← 路線図</button>
      <h1 class="sb-title">スタンプ帳</h1>
      <span class="sb-total"><b>${got}</b>/${route.stations.length}駅</span>
    </header>
    ${sectionHtml(`${route.name}（${route.section}）`, route.stations)}
    ${others.length ? sectionHtml("ほかの区間で集めたスタンプ", others, { showCount: false }) : ""}`;
  root.querySelector('[data-act="back"]').addEventListener("click", onBack);
}
