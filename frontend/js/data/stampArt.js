// 駅スタンプの線画（アプリに組み込む画像の一覧）
// - 画像：assets/stamps/{駅ID}.png（正方形・白い線／黒い背景）
// - y：絵を上下にずらす量（スタンプの座標 240×240 で。マイナスで上へ）
// - size：絵の大きさ（標準 220）
// ※ tools/make_stamp_art.py を実行すると、このファイルは自動で書き換わります。
//   自動の位置が気に入らない駅は tools/stamp_frames.json に {"駅ID": {"y": -10}} のように書いて --register-only。
export const STAMP_ART = {
  "akashi": { src: "assets/stamps/akashi.png", y: 16, size: 205 },
  "amagasaki": { src: "assets/stamps/amagasaki.png", y: 11, size: 205 },
  "asagiri": { src: "assets/stamps/asagiri.png", y: 5, size: 205 },
  "ashiya": { src: "assets/stamps/ashiya.png", y: 16, size: 205 },
  "hyogo": { src: "assets/stamps/hyogo.png", y: 7, size: 205 },
  "kobe": { src: "assets/stamps/kobe.png", y: 20, size: 205 },
  "konan-yamate": { src: "assets/stamps/konan-yamate.png", y: 11, size: 205 },
  "koshienguchi": { src: "assets/stamps/koshienguchi.png", y: -13, size: 220 },
  "maiko": { src: "assets/stamps/maiko.png", y: 5, size: 205 },
  "maya": { src: "assets/stamps/maya.png", y: 7, size: 205 },
  "motomachi": { src: "assets/stamps/motomachi.png", y: 17, size: 205 },
  "nada": { src: "assets/stamps/nada.png", y: 7, size: 205 },
  "nishinomiya": { src: "assets/stamps/nishinomiya.png", y: 17, size: 205 },
  "osaka": { src: "assets/stamps/osaka.png", y: -27, size: 220 },
  "rokkomichi": { src: "assets/stamps/rokkomichi.png", y: 15, size: 205 },
  "sakurashukugawa": { src: "assets/stamps/sakurashukugawa.png", y: 14, size: 205 },
  "sannomiya": { src: "assets/stamps/sannomiya.png", y: 14, size: 205 },
  "settsu-motoyama": { src: "assets/stamps/settsu-motoyama.png", y: -11, size: 220 },
  "shin-nagata": { src: "assets/stamps/shin-nagata.png", y: 16, size: 205 },
  "shioya": { src: "assets/stamps/shioya.png", y: 20, size: 205 },
  "suma": { src: "assets/stamps/suma.png", y: 7, size: 205 },
  "suma-kaihin-koen": { src: "assets/stamps/suma-kaihin-koen.png", y: -11, size: 220 },
  "sumiyoshi": { src: "assets/stamps/sumiyoshi.png", y: 13, size: 205 },
  "tachibana": { src: "assets/stamps/tachibana.png", y: 12, size: 205 },
  "takatori": { src: "assets/stamps/takatori.png", y: 9, size: 205 },
  "tarumi": { src: "assets/stamps/tarumi.png", y: 5, size: 205 },
};
