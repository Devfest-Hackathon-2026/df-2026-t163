// 3×3 ビンゴ画面 ＋ ミッション詳細シート ＋ クリア演出
import { CATEGORY_ICONS, missionMinutes } from "./api.js";
import { getStationProgress, setStationProgress } from "./storage.js";
import { paintColorFor } from "./data/lines.js";
import { sfx } from "./sound.js";
import { bingoBurst, confetti, toast, wait } from "./effects.js";
import { stampSvg, stampTilt, stampMotifFor } from "./stamp.js";
import { ensureStampArt } from "./stampMaker.js";
import { lineColorOf } from "./route.js";

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const phraseSegmenter = "Segmenter" in Intl ? new Intl.Segmenter("ja", { granularity: "word" }) : null;

// 単語の区切りを文節にまとめる。助詞・送りがな・記号は前に、数字の単位は数字につなげる
function toPhrases(text) {
  const phrases = [];
  for (const { segment } of phraseSegmenter.segment(text)) {
    const last = phrases.at(-1);
    const attach = last && (/^[\u3041-\u309f\u30fc！？!?、。…・）」』]/u.test(segment) || /[0-9０-９（「『]$/u.test(last));
    if (attach) phrases[phrases.length - 1] = last + segment;
    else phrases.push(segment);
  }
  return phrases;
}

// 文節の切れ目でだけ改行できる HTML（.phrased と組み合わせる）
const phraseHtml = (text) => (phraseSegmenter ? toPhrases(String(text ?? "")).map(esc).join("<wbr>") : esc(text));

const timeLabel = (m) => {
  const total = missionMinutes(m);
  return total ? `約${total}分` : "すぐ";
};

export function completedLines(opened) {
  return LINES.map((l, i) => (l.every((k) => opened[k]) ? i : -1)).filter((i) => i >= 0);
}

export class BingoScreen {
  /**
   * @param {HTMLElement} root  #screen-bingo
   * @param {{onBack: Function, onExplored: Function, onRegenerate: Function}} handlers
   */
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.sheet = document.getElementById("sheet");
    this.fileInput = document.getElementById("photo-input");
    this.fileInput.addEventListener("change", (e) => this._onPhoto(e));
    this.sheet.addEventListener("click", (e) => {
      if (e.target === this.sheet || e.target.closest("[data-close]")) this.closeSheet();
    });
    addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !this.sheet.hidden) this.closeSheet();
    });
  }

  show(line, station) {
    this.line = line;
    this.station = station;
    this.progress = getStationProgress(station.id);
    this.hideEkimeiStamp = false;
    this._render();
    this._prepareStampArt();
  }

  // 2 マス開けたら裏で線画を作り始める（ビンゴの瞬間に間に合わせるため）
  _prepareStampArt() {
    const { station, progress } = this;
    if (Object.keys(progress.opened).length < 2) return;
    ensureStampArt(station, progress, () => {
      this.h.onStampArt?.();
      const el = this.station?.id === station.id && this.root.querySelector(".ekimei-stamp");
      if (el) el.innerHTML = this._ekimeiStampSvg();
    });
  }

  _ekimeiStampSvg() {
    const { station, progress } = this;
    return stampSvg({
      station,
      color: paintColorFor(station.id),
      category: stampMotifFor(progress).category,
      date: progress.exploredAt,
      perfect: !!progress.perfectAt,
      art: progress.stampArt,
    });
  }

  _save() {
    return setStationProgress(this.station.id, this.progress);
  }

  _render() {
    const { line, station, progress } = this;
    const idx = line.stations.findIndex((s) => s.id === station.id);
    const prev = line.stations[idx - 1];
    const next = line.stations[idx + 1];
    const openedCount = Object.keys(progress.opened).length;
    const lines = completedLines(progress.opened);
    const canRegen = openedCount <= (progress.opened[4] ? 1 : 0) && !Object.keys(progress.photos ?? {}).length;

    this.root.style.setProperty("--line-color", station.lineName ? lineColorOf(line, station.lineName) : line.color);
    this.root.style.setProperty("--paint", paintColorFor(station.id));
    this.root.innerHTML = `
      <header class="bingo-top">
        <button class="btn-ghost" data-act="back" type="button">← 路線図</button>
        <span class="badge ${progress.source === "api" ? "badge-ai" : "badge-demo"}"
          title="${progress.source === "api" ? "Places API の実在スポット＋Gemini で生成" : "バックエンド未接続のためデモデータ"}">
          ${progress.source === "api" ? "✦ AI生成" : "デモデータ"}
        </span>
      </header>

      <section class="ekimei" aria-label="${esc(station.name)}駅">
        ${progress.exploredAt && !this.hideEkimeiStamp ? `<span class="ekimei-stamp" style="--tilt:${stampTilt(station.id)}deg">${this._ekimeiStampSvg()}</span>` : ""}
        <div class="ekimei-kana">${esc(station.kana)}</div>
        <h1 class="ekimei-name">${esc(station.name)}</h1>
        <div class="ekimei-romaji">${esc(station.romaji)}</div>
        <div class="ekimei-bar">
          <span class="ekimei-prev">${prev ? `◀ ${esc(prev.name)}` : ""}</span>
          <span class="ekimei-line">${esc(station.lineName ?? line.name)}</span>
          <span class="ekimei-next">${next ? `${esc(next.name)} ▶` : ""}</span>
        </div>
      </section>

      <div class="bingo-status">
        <span class="bingo-score"><b>${openedCount}</b>/9 達成 ・ <b>${lines.length}</b> ライン</span>
      </div>

      <div class="bingo-grid" role="grid" aria-label="ビンゴカード">
        ${progress.missions.map((m, i) => this._cellHtml(m, i, lines)).join("")}
      </div>

      <p class="bingo-help">マスをタップするとお店の場所と達成ボタンが出るよ。縦・横・斜めがそろったらビンゴ！</p>

      <div class="bingo-actions">
        ${canRegen ? `<button class="btn-ghost small" data-act="regen" type="button">🔄 ミッションを作り直す</button>` : ""}
      </div>
    `;

    this.root.querySelector('[data-act="back"]').addEventListener("click", () => this.h.onBack());
    this.root.querySelector('[data-act="regen"]')?.addEventListener("click", () => this.h.onRegenerate(station));
    this.root.querySelectorAll(".bcell").forEach((el) =>
      el.addEventListener("click", () => { sfx.tap(); this.openSheet(+el.dataset.i); })
    );
  }

  _photoOf(i) {
    return this.progress.photos?.[i] ?? this.progress.opened[i]?.thumb ?? ""; // thumb は以前の版で保存した写真
  }

  _cellHtml(m, i, lines) {
    const o = this.progress.opened[i];
    const inLine = lines.some((li) => LINES[li].includes(i));
    const icon = CATEGORY_ICONS[m.category] ?? "✨";
    const walk = m.walkMinutes ? `・徒歩${m.walkMinutes}分` : "";
    const photo = this._photoOf(i);
    return `
      <button type="button" class="bcell${o ? " opened" : ""}${inLine ? " in-line" : ""}${m.isFree ? " free" : ""}${photo ? " has-photo" : ""}"
        data-i="${i}" role="gridcell" aria-label="${esc(m.title)}${o ? "（達成済み）" : ""}">
        ${photo
          ? `<span class="bcell-photo"><img src="${esc(photo)}" alt=""></span>`
          : `<span class="bcell-icon" aria-hidden="true">${icon}</span>`}
        <span class="bcell-title phrased">${phraseHtml(m.title)}</span>
        <span class="bcell-walk">⏱${timeLabel(m)}${walk}</span>
        ${o ? `<span class="stamp" aria-hidden="true"><span>達成</span></span>` : ""}
      </button>`;
  }

  // ===== 詳細シート =====
  openSheet(i) {
    const m = this.progress.missions[i];
    const o = this.progress.opened[i];
    this.currentIdx = i;
    const icon = CATEGORY_ICONS[m.category] ?? "✨";
    const walk = m.walkMinutes === 0 ? "駅すぐ" : m.walkMinutes ? `駅から徒歩 約${m.walkMinutes}分` : "";
    const photo = this._photoOf(i);
    this.sheet.querySelector(".sheet-body").innerHTML = `
      <div class="sheet-head">
        <span class="sheet-icon" aria-hidden="true">${icon}</span>
        <div>
          <h2 class="sheet-title phrased" id="sheet-title">${phraseHtml(m.title)}</h2>
          ${m.spotName ? `<div class="sheet-spot">📍 ${esc(m.spotName)}</div>` : ""}
        </div>
      </div>
      ${m.description ? `<p class="sheet-desc phrased">${phraseHtml(m.description)}</p>` : ""}
      <div class="sheet-facts"><span>⏱ 所要時間 ${timeLabel(m)}</span>${walk ? `<span>🚶 ${walk}</span>` : ""}</div>
      ${m.photoHint ? `<p class="sheet-hint">ヒント：${esc(m.photoHint)}</p>` : ""}
      ${photo ? `<img src="${esc(photo)}" alt="登録した写真" class="sheet-my-photo">` : ""}
      <a class="btn-map" href="${esc(m.mapsUrl)}" target="_blank" rel="noopener">Googleマップで場所を見る ↗</a>

      ${o ? `<div class="sheet-result"><div class="done-box"><b>達成済み！</b></div></div>` : ""}

      <div class="sheet-actions">
        ${o ? "" : `<button type="button" class="btn-primary" data-act="done">✅ 達成した！スタンプを押す</button>`}
        <button type="button" class="btn-secondary" data-act="photo">📷 ${photo ? "写真を変更" : "写真を登録"}</button>
      </div>
    `;
    this.sheet.querySelector('[data-act="done"]')?.addEventListener("click", () => this.complete(i));
    this.sheet.querySelector('[data-act="photo"]').addEventListener("click", () => this.fileInput.click());
    this.sheet.hidden = false;
    requestAnimationFrame(() => this.sheet.classList.add("open"));
    this.sheet.querySelector(".sheet-panel").focus();
  }

  closeSheet() {
    this.sheet.classList.remove("open");
    setTimeout(() => { this.sheet.hidden = true; }, 220);
  }

  async _onPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const i = this.currentIdx;
    let photo;
    try {
      photo = await toCellPhoto(file);
    } catch (err) {
      console.error(err);
      sfx.fail();
      toast("この写真は読み込めませんでした");
      return;
    }
    const photos = (this.progress.photos ??= {});
    const previous = photos[i];
    photos[i] = photo;
    if (!this._save()) {
      if (previous) photos[i] = previous;
      else delete photos[i];
      this._save();
      sfx.fail();
      toast("保存できる容量がいっぱいで、写真を登録できませんでした");
      return;
    }
    sfx.tap();
    this._render();
    this.openSheet(i);
    toast("写真を登録したよ");
  }

  // ===== マスを開ける =====
  async complete(i) {
    if (this.progress.opened[i]) return;
    const before = completedLines(this.progress.opened);
    this.progress.opened[i] = { at: Date.now() };
    const after = completedLines(this.progress.opened);
    const newLines = after.filter((l) => !before.includes(l));
    const openedCount = Object.keys(this.progress.opened).length;
    const firstBingo = !this.progress.exploredAt && after.length > 0;
    const perfect = openedCount === 9 && !this.progress.perfectAt;
    if (firstBingo || perfect) this.hideEkimeiStamp = true; // スタンプは路線図でハンコを押してから見せる
    if (firstBingo) {
      this.progress.exploredAt = Date.now();
      // スタンプの絵柄：最初にそろったラインの中で、FREE 以外の最後に達成したスポット
      if (!this.progress.stampMotif) {
        const cand = LINES[after[0]].map((k) => this.progress.missions[k]).filter((m) => !m.isFree);
        const pick = cand.find((m) => this.progress.missions[i] === m) ?? cand[0];
        if (pick) this.progress.stampMotif = { category: pick.category, label: pick.spotName };
      }
    }
    if (perfect) this.progress.perfectAt = Date.now();
    this.progress.bingoLines = after;
    this._save();
    this._prepareStampArt();

    this.closeSheet();
    await wait(240);
    this._render();
    const cell = this.root.querySelector(`.bcell[data-i="${i}"]`);
    cell.classList.add("just-opened");
    sfx.stamp();
    if (navigator.vibrate) navigator.vibrate(30);
    await wait(520);

    if (newLines.length) {
      // そろったラインを光らせる
      const idxs = new Set(newLines.flatMap((l) => LINES[l]));
      idxs.forEach((k) => this.root.querySelector(`.bcell[data-i="${k}"]`)?.classList.add("flash"));
      await wait(500);
      await this.celebrate({ lines: after.length, pressStamp: firstBingo || perfect, perfect });
    } else {
      const left = 9 - openedCount;
      toast(left ? `達成！あと${left}マス` : "全部そろった！");
    }
  }

  // ビンゴ演出。スタンプが新しく押せるときは演出のあと自動で路線図へ戻り、そこでハンコを押す
  async celebrate({ lines, pressStamp, perfect }) {
    sfx.bingo();
    const colors = [paintColorFor(this.station.id), "#ffb400", "#ffffff", "#e2412b", this.line.color];
    confetti({ colors });
    setTimeout(() => confetti({ colors, count: 80, origin: { x: innerWidth * 0.15, y: innerHeight * 0.6 } }), 300);
    setTimeout(() => confetti({ colors, count: 80, origin: { x: innerWidth * 0.85, y: innerHeight * 0.6 } }), 550);
    setTimeout(() => confetti({ colors, count: 120, origin: { x: innerWidth * 0.3, y: innerHeight * 0.2 } }), 950);
    setTimeout(() => confetti({ colors, count: 120, origin: { x: innerWidth * 0.7, y: innerHeight * 0.2 } }), 1250);
    const burst = bingoBurst({ sub: perfect ? "全マス制覇！" : `${lines}ライン達成！` });
    if (!pressStamp) return;
    // 演出中は操作できないように
    this.root.classList.add("locked");
    await burst;
    this.root.classList.remove("locked");
    this.h.onExplored(this.station);
  }
}

const CELL_PHOTO_MAX_PX = 360;

// 端末内に保存するので、マスと詳細シートに足りる大きさまで縮小する
async function toCellPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, CELL_PHOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.72);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}
