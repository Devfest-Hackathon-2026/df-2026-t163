// 紙吹雪（ライブラリ不使用・canvas 自作）
let canvas, c2d, parts = [], raf = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.className = "confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  document.body.appendChild(canvas);
  c2d = canvas.getContext("2d");
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  addEventListener("resize", resize);
}

const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

export function confetti({ count = 140, colors = ["#ff5a5f", "#ffb400", "#00a699", "#7b61ff", "#2d9cdb", "#ffffff"], origin = null } = {}) {
  if (reduceMotion()) return;
  ensureCanvas();
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  for (let i = 0; i < count; i++) {
    const ang = Math.random() * Math.PI * 2;
    const sp = 4 + Math.random() * 9;
    parts.push({
      x: ox, y: oy,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp - 6,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 10,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.4,
      color: colors[(Math.random() * colors.length) | 0],
      life: 0, max: 110 + Math.random() * 60,
      shape: Math.random() < 0.25 ? "circle" : "rect",
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  c2d.clearRect(0, 0, innerWidth, innerHeight);
  parts = parts.filter((p) => p.life < p.max && p.y < innerHeight + 40);
  for (const p of parts) {
    p.life++;
    p.vy += 0.28;
    p.vx *= 0.985;
    p.vy *= 0.985;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    c2d.save();
    c2d.globalAlpha = Math.max(0, 1 - p.life / p.max);
    c2d.translate(p.x, p.y);
    c2d.rotate(p.rot);
    c2d.fillStyle = p.color;
    if (p.shape === "circle") {
      c2d.beginPath();
      c2d.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      c2d.fill();
    } else {
      c2d.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 2)) + 2);
    }
    c2d.restore();
  }
  raf = parts.length ? requestAnimationFrame(tick) : (c2d.clearRect(0, 0, innerWidth, innerHeight), null);
}

const BURST_MS = 2500;
const BURST_STARS = 14;

// 「BINGO!!!」の全画面演出。終わったら解決する（操作は妨げない）
export function bingoBurst({ sub = "" } = {}) {
  document.querySelector(".bingo-burst")?.remove();
  const el = document.createElement("div");
  el.className = "bingo-burst";
  el.setAttribute("role", "status");
  el.setAttribute("aria-label", `BINGO! ${sub}`);
  const letters = [..."BINGO!!!"].map((c, i) => `<span style="--i:${i}">${c}</span>`).join("");
  const stars = Array.from({ length: BURST_STARS }, (_, i) => {
    const ang = (i / BURST_STARS) * Math.PI * 2;
    const dist = 34 + (i % 3) * 12;
    return `<i style="--dx:${(Math.cos(ang) * dist).toFixed(1)}vmin;--dy:${(Math.sin(ang) * dist).toFixed(1)}vmin;--d:${(i % 4) * 60}ms">★</i>`;
  }).join("");
  el.innerHTML = `
    <div class="bb-rays"></div>
    <div class="bb-ring"></div>
    <div class="bb-ring bb-ring-2"></div>
    <div class="bb-stars" aria-hidden="true">${stars}</div>
    <div class="bb-center">
      <div class="bb-word" aria-hidden="true">${letters}</div>
      <div class="bb-sub"></div>
    </div>
    <div class="bb-flash"></div>`;
  el.querySelector(".bb-sub").textContent = sub;
  document.body.appendChild(el);
  return new Promise((resolve) => setTimeout(() => { el.remove(); resolve(); }, BURST_MS));
}

// トースト通知
export function toast(msg, ms = 2600) {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, reduceMotion() ? Math.min(ms, 60) : ms));
