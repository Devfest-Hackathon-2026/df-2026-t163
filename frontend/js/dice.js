// CSS 3D サイコロ
import { sfx } from "./sound.js";
import { wait } from "./effects.js";

// 各面の目の位置（3x3 グリッドの 0..8）
const PIPS = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};
// face -> その面を正面に向けるための回転
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 2: [90, 0] };
const FACE_CLASS = { 1: "front", 6: "back", 3: "right", 4: "left", 5: "top", 2: "bottom" };

const LANDED_PAUSE_MS = 650;

export function createDice(host) {
  host.innerHTML = "";
  const scene = document.createElement("div");
  scene.className = "dice-scene";
  const cube = document.createElement("div");
  cube.className = "dice-cube";
  for (let n = 1; n <= 6; n++) {
    const face = document.createElement("div");
    face.className = `dice-face ${FACE_CLASS[n]}${n === 1 ? " one" : ""}`;
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("span");
      if (PIPS[n].includes(i)) cell.className = "pip";
      face.appendChild(cell);
    }
    cube.appendChild(face);
  }
  scene.appendChild(cube);
  host.appendChild(scene);

  let spinX = 0, spinY = 0;
  setFace(1, false);

  function setFace(n, animate = true) {
    const [bx, by] = FACE_ROT[n];
    cube.style.transition = animate ? "transform 1.25s cubic-bezier(.2,.75,.25,1.05)" : "none";
    cube.style.transform = `rotateX(${spinX * 360 + bx}deg) rotateY(${spinY * 360 + by}deg)`;
  }

  async function roll() {
    const n = 1 + Math.floor(Math.random() * 6);
    spinX += 2 + Math.floor(Math.random() * 2);
    spinY += 2 + Math.floor(Math.random() * 2);
    scene.classList.remove("landed");
    scene.classList.add("rolling");
    host.classList.add("center-stage");
    setFace(n, true);
    const ticks = setInterval(sfx.diceTick, 70);
    await wait(1250);
    clearInterval(ticks);
    scene.classList.remove("rolling");
    scene.classList.add("landed");
    sfx.diceLand();
    await wait(LANDED_PAUSE_MS); // 出た目を中央で見せてからドックに戻す
    host.classList.remove("center-stage");
    return n;
  }

  return { roll, setFace };
}
