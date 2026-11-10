// 駅スタンプ（SVG で生成）
// 太い外枠（下側に白字の日付）＋内側に絵＋下に駅名の札。feTurbulence でインクのかすれを付ける
// 絵：js/data/stampArt.js に線画が登録されている駅はその線画、無い駅はモチーフのアイコン
import { STAMP_ART } from "./data/stampArt.js";

// モチーフ用アイコン（24x24, 線画）— すべて自作
const ICONS = {
  bakery: `<path d="M4 15c0-4.5 3.6-8 8-8s8 3.5 8 8v3H4z"/><path d="M9 9.5l1 3M12.5 8.6v3.2M16 9.8l-1 2.8"/>`,
  cafe: `<path d="M5 10h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3.5c-1 1.4 1 2.4 0 4M12.5 3.5c-1 1.4 1 2.4 0 4"/>`,
  sweets: `<path d="M3 19h18v-6L3 9z"/><path d="M3 14l18 2.5"/><circle cx="7" cy="6.5" r="1.8"/><path d="M7 4.7c.5-1.5 1.6-2 2.8-2"/>`,
  food: `<path d="M3 12h18c0 4-4 7.5-9 7.5S3 16 3 12z"/><path d="M14.5 3l-5 8M19 4l-6.5 7"/><path d="M9 21h6"/>`,
  park: `<path d="M12 3.5a4 4 0 0 1 3.9 3.1A3.6 3.6 0 0 1 16.5 13.5h-9a3.6 3.6 0 0 1 .6-6.9A4 4 0 0 1 12 3.5z"/><path d="M12 13.5V21M7.5 21h9M12 17.5l2.5-2"/>`,
  shrine: `<path d="M2.5 5.5c4 1.4 15 1.4 19 0"/><path d="M5 9.5h14M7 6.6V21M17 6.6V21M12 7v2.5"/>`,
  shop: `<path d="M5 8h14l-1 12H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>`,
  view: `<path d="M3 8h4l2-2.5h6L17 8h4v11H3z"/><circle cx="12" cy="13.2" r="3.6"/>`,
  culture: `<path d="M3 9l9-5 9 5z"/><path d="M4 20.5h16M6 11v7M10 11v7M14 11v7M18 11v7"/>`,
  bench: `<path d="M4 8h16M4 12h16M6 12v7M18 12v7M5 8v4M19 8v4"/>`,
  other: `<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>`,
  station: `<path d="M7 3.5h10a2.5 2.5 0 0 1 2.5 2.5v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3V6A2.5 2.5 0 0 1 7 3.5z"/><path d="M7 7h10v4H7z"/><circle cx="8.5" cy="14.5" r=".8"/><circle cx="15.5" cy="14.5" r=".8"/><path d="M8 18.5l-2 2.5M16 18.5l2 2.5"/>`,
};

export const stampIcon = (category) => ICONS[category] ?? ICONS.other;

let uid = 0;

// ページに1回だけインクフィルタを定義
export function ensureInkFilter() {
  if (document.getElementById("ink-defs")) return;
  const wrap = document.createElement("div");
  wrap.innerHTML = `
  <svg id="ink-defs" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
    <defs>
      <filter id="ink" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" result="n1"/>
        <feDisplacementMap in="SourceGraphic" in2="n1" scale="1.2" xChannelSelector="R" yChannelSelector="G" result="d"/>
        <feTurbulence type="fractalNoise" baseFrequency="0.16" numOctaves="2" seed="11" result="n2"/>
        <feColorMatrix in="n2" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.4 1.72" result="mask"/>
        <feComposite in="d" in2="mask" operator="in"/>
      </filter>
    </defs>
  </svg>`;
  document.body.prepend(wrap.firstElementChild);
}

export const fmtDate = (t) => {
  const d = new Date(t ?? Date.now());
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const hasStampArt = (stationId) => !!STAMP_ART[stationId];

const FONT = `"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Noto Sans JP", sans-serif`;

/**
 * @param {{station:{id,name}, color:string, category?:string, date?:number, perfect?:boolean, art?:{src:string,size:number,y:number}}} o  art はその場で作った線画
 */
export function stampSvg({ station, color, category = "station", date, perfect = false, art: generatedArt = null }) {
  ensureInkFilter();
  const id = `st${++uid}`;
  const name = station.name;
  // 文字列は枠の情報を持たない初期の線画
  const art = typeof generatedArt === "string" ? { src: generatedArt, size: 172, y: 2 } : generatedArt ?? STAMP_ART[station.id];

  // 絵の部分（円の内側でクリップ）
  let picture;
  if (art) {
    // 線画PNG（白い線・黒背景）をマスクにして、駅の色で塗る
    const size = art.size ?? 220;
    const x = art.x ?? (120 - size / 2);
    const y = art.y ?? -22;
    picture = `
      <mask id="${id}m" maskUnits="userSpaceOnUse" x="0" y="0" width="240" height="240">
        <image href="${esc(art.src)}" x="${x}" y="${y}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid slice"/>
      </mask>
      <rect x="0" y="0" width="240" height="240" fill="currentColor" mask="url(#${id}m)"/>`;
  } else {
    // 線画が無い駅：モチーフのアイコンを大きく＋地面の線
    picture = `
      <g transform="translate(66 34) scale(4.5)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${stampIcon(category)}</g>
      <path d="M30 150 H210" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
      <path d="M44 158 H80 M160 158 H196" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
  }

  // 駅名の札：文字数に合わせて文字を小さく
  const fs = Math.min(25, 84 / Math.max(1, name.length));
  const ls = name.length <= 3 ? 6 : name.length <= 4 ? 3 : 1;

  return `
  <svg class="stamp-svg" viewBox="0 0 240 240" role="img" aria-label="${esc(name)}駅スタンプ" style="color:${color}">
    <defs>
      <clipPath id="${id}c"><circle cx="120" cy="120" r="88.5"/></clipPath>
      <path id="${id}b" d="M 12 120 A 108 108 0 0 0 228 120"/>
    </defs>
    <g filter="url(#ink)">
      <g clip-path="url(#${id}c)">${picture}</g>
      <circle cx="120" cy="120" r="105" fill="none" stroke="currentColor" stroke-width="20"/>
      <circle cx="120" cy="120" r="92" fill="none" stroke="currentColor" stroke-width="2.5"/>
      <rect x="70" y="170" width="100" height="32" rx="6" fill="currentColor" stroke="#fff" stroke-width="3"/>
      <text x="120" y="${186 + fs * 0.36}" text-anchor="middle" font-family='${FONT}' font-weight="800" font-size="${fs.toFixed(1)}" letter-spacing="${ls}" fill="#fff">${esc(name)}</text>
      <text font-family='${FONT}' font-weight="800" font-size="12" letter-spacing="3" fill="#fff">
        <textPath href="#${id}b" startOffset="50%" text-anchor="middle">${perfect ? "★ 完全制覇 ★" : fmtDate(date)}</textPath>
      </text>
    </g>
  </svg>`;
}

// 駅ごとに少しずつ傾ける（毎回同じ角度）
export function stampTilt(stationId) {
  let h = 7;
  for (const ch of stationId) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
  return (h % 29) - 14;
}

// スタンプのモチーフ：バックエンドの stamp 指定 → 最初にそろったラインの中のスポット → 駅
export function stampMotifFor(progress) {
  if (progress?.stamp?.category) return progress.stamp;
  if (progress?.stampMotif) return progress.stampMotif;
  return { category: "station", label: "" };
}
