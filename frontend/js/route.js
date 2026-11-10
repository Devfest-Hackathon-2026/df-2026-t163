// 定期券の区間えらび（最初の画面）。乗り換えがあれば区間を足していき、1 本の「路線」につなげる
import { fetchNearbyStations, fetchRailLines, fetchRailStations, fetchRouteDetails } from "./api.js";
import { LINES } from "./data/lines.js";
import { toast } from "./effects.js";

const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
  "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
];
const ROUTE_COLOR = "#0072bc";
// イメージカラーが取れなかった路線の色（前後の区間と違う色になるように順番に使う）
const FALLBACK_LINE_COLORS = ["#0072bc", "#e2412b", "#00a699", "#7b61ff", "#f6820d"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// 以前の JR 2 路線の駅は、集めたスタンプと線画を引き継ぐために同じ ID と読みを使う
const LEGACY_STATIONS = new Map(LINES.flatMap((l) => l.stations).map((st) => [st.name, st]));

// 同じ名前の JR の駅が他の地方にもある（福岡の桂川など）ので都道府県も見る。空はデモモード
const LEGACY_PREFECTURES = new Set(["", "京都府", "大阪府", "兵庫県"]);
const legacyOf = (raw) => (raw.line.startsWith("JR") && LEGACY_PREFECTURES.has(raw.prefecture) ? LEGACY_STATIONS.get(raw.name) : undefined);

function stationId(raw) {
  const legacy = legacyOf(raw);
  if (legacy) return legacy.id;
  // 同じ名前でも場所が違えば別の駅（JR吹田と阪急吹田など）。同じ駅は路線をまたいで共有する
  return raw.lat == null ? `${raw.name}@${raw.line}` : `${raw.name}@${raw.lat.toFixed(3)},${raw.lng.toFixed(3)}`;
}

/** 乗車駅から降車駅までの駅。環状線は短いほうを回る */
export function stationsBetween(list, from, to) {
  const forward = from <= to ? list.slice(from, to + 1) : list.slice(to, from + 1).reverse();
  if (list[0]?.prev !== list.at(-1)?.name || forward.length * 2 <= list.length + 1) return forward;
  const after = list.slice(Math.max(from, to));
  const before = list.slice(0, Math.min(from, to) + 1);
  return from <= to ? [...before.reverse(), ...after.reverse()] : [...after, ...before];
}

/** 区間をつないで、盤面で使う 1 本の路線を作る */
export function buildRoute(legs) {
  const stations = [];
  const seen = new Set();
  legs.forEach((leg, legIndex) => {
    const part = stationsBetween(leg.stations, leg.from, leg.to);
    if (legIndex > 0) stations.at(-1).transfer = true;
    part.forEach((raw, i) => {
      const id = stationId(raw);
      const major = i === 0 || i === part.length - 1;
      if (seen.has(id) || stations.at(-1)?.name === raw.name) {
        if (major && stations.at(-1)?.id === id) stations.at(-1).major = true;
        return;
      }
      // 乗り換え駅の名前が違う（大阪→大阪梅田など）ときは歩いて移動する区間になる
      const walk = legIndex > 0 && i === 0;
      seen.add(id);
      const legacy = legacyOf(raw);
      stations.push({
        id, name: raw.name, kana: legacy?.kana ?? "", romaji: legacy?.romaji ?? "",
        major, lineName: raw.line, lat: raw.lat, lng: raw.lng,
        ...(walk ? { transfer: true, walkFromPrev: true } : {}),
      });
    });
  });
  const summary = legs.map((l) => ({
    prefecture: l.prefecture, line: l.line, from: l.stations[l.from].name, to: l.stations[l.to].name,
  }));
  return {
    id: summary.map((l) => `${l.line}:${l.from}-${l.to}`).join("|"),
    name: [...new Set(summary.map((l) => l.line))].join(" → "),
    section: `${stations[0].name}〜${stations.at(-1).name}`,
    color: ROUTE_COLOR,
    legs: summary,
    stations,
  };
}

/** 路線のイメージカラー。取れていないときは区間の順番で色を割り当てる */
export function lineColorOf(route, lineName) {
  const known = route.lineColors?.[lineName];
  if (known) return known;
  const index = route.legs.findIndex((leg) => leg.line === lineName);
  return index < 0 ? route.color : FALLBACK_LINE_COLORS[index % FALLBACK_LINE_COLORS.length];
}

/** 駅の読みと路線の色を埋める。取れなくても遊べる */
export async function fillRouteDetails(route) {
  const names = route.stations.filter((st) => !st.kana).map((st) => st.name);
  try {
    const { readings, lineColors } = await fetchRouteDetails(names, [...new Set(route.legs.map((l) => l.line))]);
    route.stations.forEach((st) => {
      if (!st.kana && readings[st.name]) Object.assign(st, readings[st.name]);
    });
    route.lineColors = lineColors;
  } catch (e) {
    console.warn("[route] details failed:", e);
  }
}

/** 路線の色分け（盤面の線路用）。隣り合う駅の間ごとに、同じ路線をまとめる */
export function trackSegments(route) {
  const segments = [];
  route.stations.slice(1).forEach((st, i) => {
    const walk = !!st.walkFromPrev;
    const color = walk ? null : lineColorOf(route, st.lineName);
    const last = segments.at(-1);
    if (last && last.walk === walk && last.color === color) last.to = i + 1;
    else segments.push({ from: i, to: i + 1, color, walk });
  });
  return segments;
}

const newLeg = (prefecture = "") => ({ prefecture, lines: [], nearby: [], line: "", stations: [], from: -1, to: -1, token: 0 });
const legReady = (leg) => leg.line && leg.from >= 0 && leg.to >= 0 && leg.from !== leg.to;

export class RoutePicker {
  /** @param {HTMLElement} root @param {{onDone: Function, onCancel: Function}} handlers */
  constructor(root, handlers) {
    this.root = root;
    this.h = handlers;
    this.saving = false;
    root.addEventListener("change", (e) => this._onChange(e));
    root.addEventListener("click", (e) => this._onClick(e));
  }

  /** @param {{canCancel: boolean, route?: object}} o  route を渡すと今の区間を入れた状態で開く */
  show({ canCancel, route = null }) {
    this.canCancel = canCancel;
    this.currentId = route?.id ?? null;
    this.legs = route
      ? route.legs.map((l) => ({ ...newLeg(l.prefecture), line: l.line, lines: [l.line] }))
      : [newLeg()];
    this.saving = false;
    this._render();
    if (route) this._restore(route.legs, this.legs);
  }

  async _restore(saved, legs) {
    try {
      await Promise.all(legs.map(async (leg, i) => {
        const token = leg.token;
        const [lines, stations] = await Promise.all([fetchRailLines(leg.prefecture), fetchRailStations(leg.line)]);
        if (token !== leg.token) return; // 読み込み中に選び直された
        const indexOf = (name) => stations.findIndex((st) => st.name === name);
        // 乗り換えで別の都道府県の路線を選んでいても、選択肢から消えないようにする
        Object.assign(leg, { lines, nearby: lines.includes(leg.line) ? [] : [leg.line], stations, from: indexOf(saved[i].from), to: indexOf(saved[i].to) });
      }));
    } catch (e) {
      console.error(e);
      toast("今の区間を読み込めませんでした。選び直してね");
    }
    if (legs === this.legs) this._render();
  }

  _optionHtml(value, label, selected, disabled = false) {
    return `<option value="${esc(value)}"${selected ? " selected" : ""}${disabled ? " disabled" : ""}>${esc(label)}</option>`;
  }

  _lineSelectHtml(leg, i) {
    const nearby = [...new Set(leg.nearby)];
    const others = leg.lines.filter((l) => !nearby.includes(l));
    return `
      <select data-leg="${i}" data-key="line"${nearby.length || others.length ? "" : " disabled"}>
        ${this._optionHtml("", "路線をえらぶ", !leg.line)}
        ${nearby.length ? `<optgroup label="乗り換えできる路線">${nearby.map((l) => this._optionHtml(l, l, l === leg.line)).join("")}</optgroup>` : ""}
        ${others.length ? `<optgroup label="${esc(leg.prefecture)}の路線">${others.map((l) => this._optionHtml(l, l, l === leg.line)).join("")}</optgroup>` : ""}
      </select>`;
  }

  _stationSelectHtml(leg, i, key, placeholder) {
    return `
      <select data-leg="${i}" data-key="${key}"${leg.stations.length ? "" : " disabled"}>
        ${this._optionHtml("-1", placeholder, leg[key] < 0)}
        ${leg.stations.map((st, k) => this._optionHtml(k, st.name, k === leg[key])).join("")}
      </select>`;
  }

  _legHtml(leg, i) {
    const count = legReady(leg) ? stationsBetween(leg.stations, leg.from, leg.to).length : 0;
    return `
      <section class="route-leg" aria-label="${i + 1}本目の路線">
        <div class="route-leg-head">
          <span class="route-leg-no">${i === 0 ? "乗る路線" : `乗り換え ${i}`}</span>
          ${count ? `<span class="route-leg-count">${count}駅</span>` : ""}
          ${i > 0 ? `<button type="button" class="btn-ghost small" data-act="remove" data-leg="${i}">削除</button>` : ""}
        </div>
        <div class="setup-row two">
          <label class="field">
            <span class="field-label">都道府県</span>
            <select data-leg="${i}" data-key="prefecture">
              ${this._optionHtml("", "えらぶ", !leg.prefecture)}
              ${PREFECTURES.map((p) => this._optionHtml(p, p, p === leg.prefecture)).join("")}
            </select>
          </label>
          <label class="field"><span class="field-label">路線</span>${this._lineSelectHtml(leg, i)}</label>
        </div>
        <div class="setup-row two">
          <label class="field"><span class="field-label">乗車駅</span>${this._stationSelectHtml(leg, i, "from", "えらぶ")}</label>
          <label class="field"><span class="field-label">降車駅</span>${this._stationSelectHtml(leg, i, "to", "えらぶ")}</label>
        </div>
        ${leg.from >= 0 && leg.from === leg.to ? `<p class="route-error">乗車駅と降車駅は別の駅を選んでね</p>` : ""}
      </section>`;
  }

  _render() {
    const ready = this.legs.every(legReady);
    const total = ready ? buildRoute(this.legs).stations.length : 0;
    this.root.innerHTML = `
      <header class="route-top">
        ${this.canCancel ? `<button class="btn-ghost" data-act="cancel" type="button">← もどる</button>` : ""}
        <div class="logo">定期券すごろく</div>
      </header>
      <svg class="route-ticket" viewBox="0 0 120 64" aria-hidden="true">
        <path d="M8 6h104a4 4 0 0 1 4 4v14a8 8 0 0 0 0 16v14a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V40a8 8 0 0 0 0-16V10a4 4 0 0 1 4-4z" fill="#fff" stroke="currentColor" stroke-width="3.5"/>
        <path d="M84 10v44" stroke="currentColor" stroke-width="2" stroke-dasharray="4 4"/>
        <path d="M16 22h44M16 32h30M16 42h38" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="100" cy="32" r="9" fill="none" stroke="#e2412b" stroke-width="3"/>
      </svg>
      <h1 class="route-title">あなたの定期区間は？</h1>
      <p class="route-lead">定期券で乗れる区間の駅だけで、スタンプラリーの台紙を作るよ。JR・私鉄・地下鉄・モノレールに対応。乗り換えがある人は路線を足してね。</p>
      ${this.legs.map((leg, i) => this._legHtml(leg, i)).join("")}
      <button type="button" class="btn-secondary" data-act="add"${ready ? "" : " disabled"}>＋ 乗り換えを追加</button>
      <button type="button" class="btn-primary big route-start" data-act="start"${ready && !this.saving ? "" : " disabled"}>
        ${this.saving ? "駅の読みを準備中…" : ready ? `この区間で台紙を作る（全${total}駅）` : "区間をえらんでね"}
      </button>
      <p class="small muted route-credit">駅データ：<a href="https://express.heartrails.com/" target="_blank" rel="noopener">HeartRails Express</a></p>`;
  }

  async _onChange(e) {
    const el = e.target.closest("[data-key]");
    if (!el) return;
    const leg = this.legs[+el.dataset.leg];
    const { key } = el.dataset;
    if (key === "prefecture") await this._setPrefecture(leg, el.value);
    else if (key === "line") await this._setLine(leg, el.value, +el.dataset.leg);
    else {
      leg[key] = +el.value;
      this._render();
    }
  }

  async _setPrefecture(leg, prefecture) {
    const token = ++leg.token;
    Object.assign(leg, { prefecture, lines: [], line: "", stations: [], from: -1, to: -1 });
    this._render();
    if (!prefecture) return;
    try {
      const lines = await fetchRailLines(prefecture);
      if (token === leg.token) {
        leg.lines = lines;
        this._render();
      }
    } catch (e) {
      console.error(e);
      toast("路線を読み込めませんでした。もう一度えらんでね");
    }
  }

  async _setLine(leg, line, i) {
    const token = ++leg.token;
    Object.assign(leg, { line, stations: [], from: -1, to: -1 });
    this._render();
    if (!line) return;
    try {
      const stations = await fetchRailStations(line);
      if (token !== leg.token) return;
      leg.stations = stations;
      if (i > 0) leg.from = this._nearestIndex(stations, this._lastStation(this.legs[i - 1]));
      this._render();
    } catch (e) {
      console.error(e);
      toast("駅を読み込めませんでした。もう一度えらんでね");
    }
  }

  _lastStation(leg) {
    return leg.stations[leg.to];
  }

  _nearestIndex(stations, target) {
    if (target?.lat == null) return Math.max(-1, stations.findIndex((st) => st.name === target?.name));
    let best = -1, bestDist = Infinity;
    stations.forEach((st, k) => {
      const d = (st.lat - target.lat) ** 2 + (st.lng - target.lng) ** 2;
      if (d < bestDist) { best = k; bestDist = d; }
    });
    return best;
  }

  async _addLeg() {
    const last = this._lastStation(this.legs.at(-1));
    const leg = newLeg(last.prefecture);
    this.legs.push(leg);
    this._render();
    try {
      const [lines, near] = await Promise.all([
        fetchRailLines(leg.prefecture),
        last.lat == null ? [] : fetchNearbyStations(last.lat, last.lng),
      ]);
      leg.lines = lines;
      leg.nearby = near.map((st) => st.line).filter((l) => l !== this.legs.at(-2).line);
      this._render();
    } catch (e) {
      console.error(e);
      toast("乗り換え候補を読み込めませんでした");
    }
  }

  async _start() {
    this.saving = true;
    this._render();
    const route = buildRoute(this.legs);
    if (route.id !== this.currentId) await fillRouteDetails(route);
    this.saving = false;
    this.h.onDone(route);
  }

  _onClick(e) {
    const act = e.target.closest("[data-act]");
    if (!act) return;
    if (act.dataset.act === "add") this._addLeg();
    else if (act.dataset.act === "start") this._start();
    else if (act.dataset.act === "cancel") this.h.onCancel();
    else if (act.dataset.act === "remove") {
      this.legs.splice(+act.dataset.leg, 1);
      this._render();
    }
  }
}
