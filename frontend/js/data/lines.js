// 路線と駅のデータ（固定）
// 駅の進み具合・スタンプは駅 id ごとに保存されるので、区間を変えても消えない

const MAJOR = new Set(["amagasaki", "osaka", "shin-osaka", "takatsuki", "kyoto", "nishinomiya", "sannomiya", "kobe", "akashi"]);
const s = (id, name, kana, romaji) => ({ id, name, kana, romaji, major: MAJOR.has(id) });

export const LINES = [
  {
    // JR京都線（京都〜大阪）と JR神戸線（大阪〜明石）を1本につないだ路線。
    // デモモード（?mock=1）の路線と、以前の版の駅 ID・読みの引き継ぎに使う。実際の定期区間は全国データから選ぶ。
    id: "jr-kyoto-kobe",
    name: "JR京都線・神戸線",
    section: "京都〜明石",
    color: "#0072bc",
    stations: [
      s("kyoto", "京都", "きょうと", "Kyōto"),
      s("nishioji", "西大路", "にしおおじ", "Nishiōji"),
      s("katsuragawa", "桂川", "かつらがわ", "Katsuragawa"),
      s("mukomachi", "向日町", "むこうまち", "Mukōmachi"),
      s("nagaokakyo", "長岡京", "ながおかきょう", "Nagaokakyō"),
      s("yamazaki", "山崎", "やまざき", "Yamazaki"),
      s("shimamoto", "島本", "しまもと", "Shimamoto"),
      s("takatsuki", "高槻", "たかつき", "Takatsuki"),
      s("settsu-tonda", "摂津富田", "せっつとんだ", "Settsu-Tonda"),
      s("jr-sojiji", "JR総持寺", "じぇいあーるそうじじ", "JR-Sōjiji"),
      s("ibaraki", "茨木", "いばらき", "Ibaraki"),
      s("senrioka", "千里丘", "せんりおか", "Senrioka"),
      s("kishibe", "岸辺", "きしべ", "Kishibe"),
      s("suita", "吹田", "すいた", "Suita"),
      s("higashi-yodogawa", "東淀川", "ひがしよどがわ", "Higashi-Yodogawa"),
      s("shin-osaka", "新大阪", "しんおおさか", "Shin-Ōsaka"),
      s("osaka", "大阪", "おおさか", "Ōsaka"),
      s("tsukamoto", "塚本", "つかもと", "Tsukamoto"),
      s("amagasaki", "尼崎", "あまがさき", "Amagasaki"),
      s("tachibana", "立花", "たちばな", "Tachibana"),
      s("koshienguchi", "甲子園口", "こうしえんぐち", "Kōshienguchi"),
      s("nishinomiya", "西宮", "にしのみや", "Nishinomiya"),
      s("sakurashukugawa", "さくら夙川", "さくらしゅくがわ", "Sakurashukugawa"),
      s("ashiya", "芦屋", "あしや", "Ashiya"),
      s("konan-yamate", "甲南山手", "こうなんやまて", "Kōnan-Yamate"),
      s("settsu-motoyama", "摂津本山", "せっつもとやま", "Settsu-Motoyama"),
      s("sumiyoshi", "住吉", "すみよし", "Sumiyoshi"),
      s("rokkomichi", "六甲道", "ろっこうみち", "Rokkōmichi"),
      s("maya", "摩耶", "まや", "Maya"),
      s("nada", "灘", "なだ", "Nada"),
      s("sannomiya", "三ノ宮", "さんのみや", "Sannomiya"),
      s("motomachi", "元町", "もとまち", "Motomachi"),
      s("kobe", "神戸", "こうべ", "Kōbe"),
      s("hyogo", "兵庫", "ひょうご", "Hyōgo"),
      s("shin-nagata", "新長田", "しんながた", "Shin-Nagata"),
      s("takatori", "鷹取", "たかとり", "Takatori"),
      s("suma-kaihin-koen", "須磨海浜公園", "すまかいひんこうえん", "Suma-Kaihin-Kōen"),
      s("suma", "須磨", "すま", "Suma"),
      s("shioya", "塩屋", "しおや", "Shioya"),
      s("tarumi", "垂水", "たるみ", "Tarumi"),
      s("maiko", "舞子", "まいこ", "Maiko"),
      s("asagiri", "朝霧", "あさぎり", "Asagiri"),
      s("akashi", "明石", "あかし", "Akashi"),
    ],
  },
];

export const getLine = (id) => LINES.find((l) => l.id === id) ?? LINES[0];

// 開拓済みの駅を塗るカラーパレット（駅ごとに固定で割り当て）
export const PAINT_COLORS = [
  "#ff5a5f", "#ffb400", "#00a699", "#7b61ff", "#ff7eb6",
  "#3ec1d3", "#f6820d", "#8bc34a", "#e84393", "#2d9cdb",
];

export const paintColorFor = (stationId) => {
  let h = 0;
  for (const ch of stationId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PAINT_COLORS[h % PAINT_COLORS.length];
};
