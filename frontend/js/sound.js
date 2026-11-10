// 効果音は Web Audio API でその場で合成する（音源ファイル不使用 → 著作物利用シートに載せる素材なし）
import { getSettings } from "./storage.js";

let ctx = null;
const ac = () => {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
};

function tone({ freq = 440, dur = 0.12, type = "square", vol = 0.08, at = 0, slideTo = null }) {
  if (getSettings().muted) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + at;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  unlock: () => ac(),
  tap: () => tone({ freq: 660, dur: 0.05, type: "triangle", vol: 0.06 }),
  diceTick: () => tone({ freq: 300 + Math.random() * 400, dur: 0.03, type: "square", vol: 0.03 }),
  diceLand: () => { tone({ freq: 220, dur: 0.08, type: "square", vol: 0.08 }); tone({ freq: 880, dur: 0.1, type: "triangle", vol: 0.06, at: 0.06 }); },
  whoosh: () => tone({ freq: 900, slideTo: 300, dur: 0.3, type: "sine", vol: 0.05 }),
  hop: () => tone({ freq: 520, slideTo: 900, dur: 0.08, type: "triangle", vol: 0.05 }),
  arrive: () => [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.14, type: "triangle", vol: 0.07, at: i * 0.09 })),
  stamp: () => { tone({ freq: 140, slideTo: 50, dur: 0.16, type: "sine", vol: 0.28 }); tone({ freq: 90, slideTo: 40, dur: 0.1, type: "triangle", vol: 0.15 }); tone({ freq: 1400, dur: 0.04, type: "square", vol: 0.025, at: 0.01 }); },
  fail: () => tone({ freq: 300, slideTo: 150, dur: 0.25, type: "sawtooth", vol: 0.05 }),
  bingo: () => {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319];
    seq.forEach((f, i) => tone({ freq: f, dur: 0.16, type: "square", vol: 0.06, at: i * 0.1 }));
    tone({ freq: 262, dur: 0.7, type: "triangle", vol: 0.08, at: 0.3 });
    [523, 659, 784, 1047].forEach((f) => tone({ freq: f, dur: 0.8, type: "triangle", vol: 0.05, at: 0.8 }));
  },
  paint: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.1, type: "triangle", vol: 0.06, at: i * 0.06 })),
};
