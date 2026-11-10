# 著作物利用シート（frontend 分の下書き）

フロントエンドで使った外部素材・ライブラリの一覧です。最終提出シートにそのまま転記してください。

| 種類 | 名前 | 用途 | 出典 URL | ライセンス |
|---|---|---|---|---|
| フォント | M PLUS Rounded 1c | 画面全体の文字 | https://fonts.google.com/specimen/M+PLUS+Rounded+1c | SIL Open Font License 1.1 |
| 配信 | Google Fonts | 上記フォントの読み込み | https://fonts.google.com/ | Google Fonts 利用規約（フォント自体は OFL） |
| 駅スタンプの線画 | Claude（Anthropic）で作成 | `assets/stamps/*.png`（各駅の名所を調べて線画化。選定理由と情報源は `tools/landmarks_*.csv`） | https://claude.ai | Anthropic 利用規約 |
| 路線・駅データ | HeartRails Express | 定期区間えらびの路線・駅・座標（アプリ内にクレジット表示） | https://express.heartrails.com/ | HeartRails 利用規約 |
| 駅スタンプの線画（その場で生成） | Vertex AI gemini-3.1-flash-image | 線画が用意されていない駅のスタンプ | https://cloud.google.com/vertex-ai | Google Cloud 利用規約 |
| 地図リンク | Google Maps URLs | ミッションの「Googleマップで見る」リンク | https://developers.google.com/maps/documentation/urls/get-started | Google Maps Platform 利用規約 |

## 使っていないもの（自作）

- **UI ライブラリ・JS ライブラリ：不使用**（素の HTML / CSS / JavaScript）
- **効果音：音源ファイル不使用**。Web Audio API でブラウザ上で合成（`js/sound.js`）
- **サイコロ・紙吹雪・スタンプラリー路線図（背景の雲・山・木・波）・駅名標・駅スタンプ**：すべて CSS / Canvas / SVG で自作
- **駅スタンプのモチーフアイコン**（パン・カフェ・鳥居など 12 種）：SVG パスで自作（`js/stamp.js`）
- **アイコン**：OS 標準の絵文字を文字として表示しているだけ（画像素材なし）
- **以前の JR 2 路線の駅名データ**：駅名・読みは事実情報として手入力（`js/data/lines.js`）。それ以外の駅の読みは Gemini で付与

※ 「JR」「JR京都線」「JR神戸線」は西日本旅客鉄道株式会社の路線名として表記しているのみで、ロゴ・ラインカラー公式素材は使っていません。

※ 素材を追加したら、この表に 1 行足して Discord にも URL を貼ること。
