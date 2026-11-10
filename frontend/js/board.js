// スタンプラリー路線図
// うねった路線の上に丸いスタンプ台を並べ、開拓した駅にはその駅のスタンプを押す
import { getStationProgress } from "./storage.js";
import { paintColorFor } from "./data/lines.js";
import { stampSvg, stampTilt, stampMotifFor } from "./stamp.js";
import { sfx } from "./sound.js";
import { wait } from "./effects.js";
import { trackSegments } from "./route.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Catmull-Rom → 3次ベジェでなめらかな線に
function smoothPath(pts, from = 0, to = pts.length - 1) {
  if (pts.length < 2) return "";
  let d = `M ${pts[from].x} ${pts[from].y}`;
  for (let i = from; i < to; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const t = 6;
    const c1 = { x: p1.x + (p2.x - p0.x) / t, y: p1.y + (p2.y - p0.y) / t };
    const c2 = { x: p2.x - (p3.x - p1.x) / t, y: p2.y - (p3.y - p1.y) / t };
    d += ` C ${c1.x.toFixed(1)} ${c1.y.toFixed(1)}, ${c2.x.toFixed(1)} ${c2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// 背景の飾り（自作の簡単な図形）
const DECOS = [
  (x, y) => `<g transform="translate(${x} ${y})" class="deco-cloud"><ellipse cx="0" cy="0" rx="22" ry="11"/><ellipse cx="-11" cy="-6" rx="11" ry="10"/><ellipse cx="7" cy="-9" rx="13" ry="12"/></g>`,
  (x, y) => `<g transform="translate(${x} ${y})"><path d="M-26 14 L-6 -16 L14 14z" class="deco-mt"/><path d="M-6 -16 L-12 -7 L-6 -9 L0 -7z" class="deco-snow"/><path d="M0 14 L14 -6 L28 14z" class="deco-mt2"/></g>`,
  (x, y) => `<g transform="translate(${x} ${y})"><rect x="-2" y="2" width="4" height="12" class="deco-trunk"/><circle cx="0" cy="-4" r="11" class="deco-tree"/><rect x="16" y="6" width="3" height="8" class="deco-trunk"/><circle cx="17.5" cy="1" r="7" class="deco-tree2"/></g>`,
  (x, y) => `<g transform="translate(${x} ${y})" class="deco-wave"><path d="M-24 0 q6 -6 12 0 t12 0 t12 0 t12 0"/><path d="M-18 9 q6 -6 12 0 t12 0 t12 0"/></g>`,
  (x, y) => `<g transform="translate(${x} ${y})"><circle r="10" class="deco-sun"/><g class="deco-ray">${Array.from({ length: 8 }, (_, k) => {
    const a = (k * Math.PI) / 4;
    return `<path d="M${(Math.cos(a) * 14).toFixed(1)} ${(Math.sin(a) * 14).toFixed(1)} L${(Math.cos(a) * 19).toFixed(1)} ${(Math.sin(a) * 19).toFixed(1)}"/>`;
  }).join("")}</g></g>`,
];

export class Board {
  constructor(host, { onCellTap } = {}) {
    this.host = host;
    this.onCellTap = onCellTap;
    this.line = null;
    this.startId = null;
    this.cells = [];
    this.pos = [];
    this.pieceIdx = 0;
    this.holdId = null; // ハンコ演出前の駅（まだスタンプを見せない）
    this._w = 0;
    this._ro = new ResizeObserver(() => {
      if (Math.abs(this.host.clientWidth - this._w) > 1) this._layout();
    });
  }

  render(line, startId, pieceStationId) {
    this.line = line;
    this.startId = startId;
    this.host.innerHTML = "";
    this.host.style.setProperty("--line-color", line.color);

    this.banner = document.createElement("div");
    this.banner.className = "map-banner";
    this.banner.innerHTML = `
      <span class="map-banner-line">${esc(line.name)}</span>
      <span class="map-banner-title">スタンプラリー</span>
      <span class="map-banner-sec">${esc(line.section)}</span>`;
    this.host.appendChild(this.banner);

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.classList.add("board-track");
    this.svg.setAttribute("aria-hidden", "true");
    this.host.appendChild(this.svg);

    this.cells = line.stations.map((st, i) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `slot${st.major ? " major" : ""}`;
      btn.dataset.idx = String(i);
      btn.dataset.station = st.id;
      btn.addEventListener("click", () => this.onCellTap?.(st, i));
      this.host.appendChild(btn);
      return btn;
    });

    this.piece = document.createElement("div");
    this.piece.className = "piece";
    this.piece.setAttribute("aria-hidden", "true");
    this.piece.innerHTML = `<div class="piece-body"><span class="piece-face">🚃</span></div><div class="piece-shadow"></div>`;
    this.host.appendChild(this.piece);

    this.refresh();
    this.pieceIdx = Math.max(0, line.stations.findIndex((s) => s.id === (pieceStationId ?? startId)));
    this._ro.disconnect();
    this._ro.observe(this.host);
    this._layout();
  }

  indexOf(stationId) {
    return this.line.stations.findIndex((s) => s.id === stationId);
  }

  // 各スタンプ台の中身を描き直す
  refresh() {
    if (!this.line) return;
    this.line.stations.forEach((st, i) => {
      const cell = this.cells[i];
      const p = getStationProgress(st.id);
      const opened = p ? Object.keys(p.opened ?? {}).length : 0;
      const held = st.id === this.holdId;
      const explored = !!p?.exploredAt && !held;
      const perfect = !!p?.perfectAt && !held;
      const isStart = st.id === this.startId;
      const color = paintColorFor(st.id);
      cell.classList.toggle("is-start", isStart);
      cell.classList.toggle("is-progress", !!p && !explored);
      cell.classList.toggle("is-explored", explored);
      cell.classList.toggle("is-perfect", perfect);
      cell.style.setProperty("--paint", color);

      const key = `${explored}|${perfect}|${opened}|${isStart}|${p?.exploredAt}|${held}|${!!p?.stampArt}`;
      if (cell.dataset.key === key) return;
      cell.dataset.key = key;

      const flag = isStart ? `<span class="slot-flag">乗車</span>` : st.transfer ? `<span class="slot-flag slot-flag-transfer">乗換</span>` : "";
      if (explored) {
        const motif = stampMotifFor(p);
        cell.innerHTML = `
          ${flag}
          <span class="slot-paper"></span>
          <span class="stamp-wrap" style="--tilt:${stampTilt(st.id)}deg">
            ${stampSvg({ station: st, color, category: motif.category, date: p.exploredAt, perfect, art: p.stampArt })}
          </span>
          ${perfect ? `<span class="slot-crown" aria-hidden="true">★</span>` : ""}`;
      } else {
        const fs = Math.min(15, 62 / Math.max(2, st.name.length));
        cell.innerHTML = `
          ${flag}
          <span class="slot-paper"></span>
          <span class="slot-no">No.${i + 1}</span>
          <span class="slot-name" style="font-size:${fs.toFixed(1)}px">${esc(st.name)}</span>
          <span class="slot-meta">${held ? "BINGO!" : p ? `${opened}/9` : "STAMP"}</span>`;
      }
      cell.setAttribute(
        "aria-label",
        `${i + 1}番目 ${st.name}駅${isStart ? "（出発駅）" : ""}${explored ? "（スタンプ獲得済み）" : p ? `（${opened}マス達成）` : ""}`
      );
    });
  }

  _layout() {
    if (!this.cells.length) return;
    const W = this.host.clientWidth;
    this._w = W;
    const cols = W >= 600 ? 4 : 3;
    const padX = 12;
    const rowGap = W >= 600 ? 132 : 124;
    const y0 = 178;
    const n = this.cells.length;
    const rows = Math.ceil(n / cols);
    this.pos = this.cells.map((_, i) => {
      const row = Math.floor(i / cols);
      const c = i % cols;
      const col = row % 2 === 0 ? c : cols - 1 - c;
      const wob = (col % 2 ? 16 : -12) * (row % 2 ? -1 : 1);
      const jx = ((i * 37) % 11) - 5;
      return {
        x: padX + ((W - 2 * padX) * (col + 0.5)) / cols + jx,
        y: y0 + row * rowGap + wob,
      };
    });
    const H = y0 + (rows - 1) * rowGap + 96;
    this.host.style.height = `${H}px`;

    // 飾り：Uターンしない側の空きスペースに置く
    let deco = "";
    for (let r = 0; r < rows - 1; r++) {
      const openLeft = r % 2 === 0; // 偶数行は右端でUターン → 左が空く
      const x = openLeft ? 30 : W - 30;
      const y = y0 + r * rowGap + rowGap / 2;
      deco += DECOS[(r + 1) % DECOS.length](x, y);
    }
    deco += DECOS[0](W - 46, 96) ;

    this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    this.svg.setAttribute("width", W);
    this.svg.setAttribute("height", H);
    const d = smoothPath(this.pos);
    this.svg.innerHTML = `
      <g class="decos">${deco}</g>
      <path d="${d}" class="track-halo" />
      <path d="${d}" class="track-base" />
      ${trackSegments(this.line).map((s) => `<path d="${smoothPath(this.pos, s.from, s.to)}" class="${s.walk ? "track-walk" : "track-line"}"${s.walk ? "" : ` style="stroke:${esc(s.color)}"`} />`).join("")}
      <path d="${d}" class="track-ties" />`;

    this.cells.forEach((c, i) => {
      c.style.left = `${this.pos[i].x}px`;
      c.style.top = `${this.pos[i].y}px`;
    });
    this._placePiece(this.pieceIdx, false);
  }

  _center(i) {
    return this.pos[i] ?? { x: 0, y: 0 };
  }

  _placePiece(i, animate = true) {
    const { x, y } = this._center(i);
    this.piece.style.transition = animate ? "transform .28s cubic-bezier(.3,.7,.3,1), opacity .18s" : "opacity .18s";
    this.piece.style.transform = `translate(${x}px, ${y}px)`;
    this.pieceIdx = i;
    this.cells.forEach((c, k) => c.classList.toggle("has-piece", k === i));
  }

  async warpTo(i) {
    if (i === this.pieceIdx) return;
    this.piece.classList.add("warp");
    await wait(180);
    this._placePiece(i, false);
    await wait(30);
    this.piece.classList.remove("warp");
    await wait(180);
  }

  async hopPath(indices) {
    for (const i of indices) {
      this.piece.classList.remove("hop");
      void this.piece.offsetWidth;
      this.piece.classList.add("hop");
      sfx.hop();
      this._placePiece(i, true);
      this._scrollIntoView(i);
      await wait(340);
    }
    this.piece.classList.remove("hop");
  }

  _scrollIntoView(i) {
    const r = this.cells[i].getBoundingClientRect();
    if (r.top < 120 || r.bottom > innerHeight - 230) {
      this.cells[i].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  async spotlight(i) {
    const c = this.cells[i];
    c.classList.remove("spotlight");
    void c.offsetWidth;
    c.classList.add("spotlight");
    await wait(900);
  }

  clearSpotlight() {
    this.cells.forEach((c) => c.classList.remove("spotlight"));
  }

  // ハンコが降りてきてポン！と押す演出
  async paint(stationId) {
    const i = this.indexOf(stationId);
    if (i < 0) return;
    const c = this.cells[i];
    c.scrollIntoView({ block: "center", behavior: "smooth" });
    await wait(600);

    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !c.animate) {
      this.holdId = null;
      this.refresh();
      sfx.stamp();
      return;
    }

    const size = c.offsetWidth;
    const { x, y } = this.pos[i];
    const color = paintColorFor(stationId);
    const w = size * 1.05;
    const h = w * 1.3;
    const contactY = y + size * 0.18;

    const shadow = document.createElement("div");
    shadow.className = "hanko-shadow";
    Object.assign(shadow.style, { left: `${x - size * 0.55}px`, top: `${y - size * 0.55}px`, width: `${size * 1.1}px`, height: `${size * 1.1}px` });

    const hanko = document.createElement("div");
    hanko.className = "hanko";
    Object.assign(hanko.style, { left: `${x - w / 2}px`, top: `${contactY - h * (120 / 130)}px`, width: `${w}px`, height: `${h}px` });
    hanko.innerHTML = hankoSvg(color);
    this.host.append(shadow, hanko);

    const up = "translateY(-150px) rotate(-10deg)";
    const hover = "translateY(-42px) rotate(-3deg)";
    const opts = (duration, easing) => ({ duration, easing, fill: "forwards" });

    // 1) 上から降りてきて構える
    sfx.whoosh();
    shadow.animate([{ opacity: 0, transform: "scale(.5)" }, { opacity: 0.5, transform: "scale(.8)" }], opts(420, "ease-out"));
    await hanko.animate([{ transform: up, opacity: 0 }, { transform: hover, opacity: 1 }], opts(420, "cubic-bezier(.2,.8,.3,1)")).finished;
    // ちょっと溜め
    await hanko.animate([{ transform: hover }, { transform: "translateY(-50px) rotate(-1deg)" }], opts(160, "ease-in-out")).finished;

    // 2) 押す！
    shadow.animate([{ opacity: 0.5, transform: "scale(.8)" }, { opacity: 0.8, transform: "scale(1)" }], opts(110, "ease-in"));
    await hanko.animate(
      [{ transform: "translateY(-50px) rotate(-1deg)" }, { transform: "translateY(3px) rotate(0deg) scaleY(.9)" }],
      opts(110, "cubic-bezier(.7,0,1,1)")
    ).finished;

    // 接地：スタンプが現れる
    c.classList.add("inked");
    this.holdId = null;
    this.refresh();
    sfx.stamp();
    if (navigator.vibrate) navigator.vibrate(40);
    this.host.animate(
      [{ transform: "translate(0,0)" }, { transform: "translate(0,3px)" }, { transform: "translate(-1px,-1px)" }, { transform: "translate(0,0)" }],
      { duration: 220 }
    );
    // ぎゅっと押し付ける
    await hanko.animate(
      [{ transform: "translateY(3px) scaleY(.9)" }, { transform: "translateY(5px) scaleY(.86) rotate(1.5deg)" }, { transform: "translateY(3px) scaleY(.9) rotate(-1deg)" }],
      opts(260, "ease-in-out")
    ).finished;

    // 3) 持ち上げて去る
    shadow.animate([{ opacity: 0.8 }, { opacity: 0 }], opts(380, "ease-out"));
    await hanko.animate(
      [{ transform: "translateY(3px) scaleY(.9)", opacity: 1 }, { transform: "translateY(-60px) rotate(4deg)", opacity: 1, offset: 0.55 }, { transform: "translateY(-130px) rotate(10deg)", opacity: 0 }],
      opts(520, "cubic-bezier(.3,.6,.4,1)")
    ).finished;
    sfx.paint();
    hanko.remove();
    shadow.remove();
    await wait(450);
    c.classList.remove("inked");
  }
}

// ハンコ（自作 SVG）
function hankoSvg(color) {
  return `
  <svg viewBox="0 0 100 130" aria-hidden="true">
    <ellipse cx="50" cy="19" rx="16" ry="14" fill="#e9b47c" stroke="#1d2340" stroke-width="4"/>
    <ellipse cx="45" cy="14" rx="5" ry="3.5" fill="#fff" opacity=".55"/>
    <path d="M41 31h18v14H41z" fill="#c98a52" stroke="#1d2340" stroke-width="4" stroke-linejoin="round"/>
    <path d="M26 46 Q50 40 74 46 L82 104 Q50 110 18 104 Z" fill="#e0a468" stroke="#1d2340" stroke-width="4" stroke-linejoin="round"/>
    <path d="M33 53 L28 98" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".45"/>
    <path d="M21 92 Q50 99 79 92" stroke="#b5773f" stroke-width="4" fill="none"/>
    <rect x="13" y="104" width="74" height="16" rx="5" fill="${color}" stroke="#1d2340" stroke-width="4"/>
    <path d="M19 113h62" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".35"/>
  </svg>`;
}

// サイコロの出目から移動経路を計算（端で折り返す、すごろくルール）
export function computePath(startIdx, dir, steps, length) {
  const path = [];
  let pos = startIdx;
  let d = dir;
  for (let k = 0; k < steps; k++) {
    let next = pos + d;
    if (next < 0 || next >= length) {
      d = -d;
      next = pos + d;
    }
    pos = next;
    path.push(pos);
  }
  return path;
}
