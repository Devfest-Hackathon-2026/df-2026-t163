# 定期券すごろく — frontend

素の HTML / CSS / JavaScript（ES Modules）だけで動きます。**npm install もビルドも不要。**

## 動かし方

ES Modules なので `index.html` をダブルクリックではなく、ローカルサーバーで開いてください。

```bash
cd frontend
python3 tools/dev_server.py        # Windows は python tools\dev_server.py
# ※ python3 -m http.server でも動くが、スマホが古いファイルを覚えて画面が崩れることがある
# → http://localhost:5173/          （API に接続。バックエンドが無いと最初の画面から進めない）
# → http://localhost:5173/?mock=1   （常にデモデータ。バックエンド無しで UI 確認）
# → http://localhost:5173/?api=https://xxxx.a.run.app （API の URL を一時的に指定）
```

スマホ実機で見るときは、PC と同じ Wi-Fi で `http://<PCのIP>:5173/` を開く。
（写真の撮影は https か localhost でないと動かない端末があるので、本番 URL で確認するのが確実）

## バックエンドとつなぐ

1. `js/config.js` の `API_BASE_URL` に Cloud Run の URL を入れる（同じオリジンで配信するなら空のまま）
2. `MODE` は既定で `"api"`（デモデータに黙って切り替えない）。バックエンド無しで UI を確認するときは `?mock=1` を付ける
3. API の形は **`API_CONTRACT.md`**（バックエンド担当に共有済みの想定）

## 画面と処理の流れ

| Step | 画面 | ファイル |
|---|---|---|
| 1 | 初めて開いたときに定期区間（乗車駅〜降車駅）を選ぶ（変更はメニューから）→ その区間の駅だけで台紙ができる → 毎回は方向だけ選んでサイコロ → コマが前回止まった駅から1駅ずつ進む（終点で折り返し、振り直しは振る前の駅から） | `js/main.js` `js/board.js` `js/dice.js` |
| 2 | 止まった駅で `/api/missions` → 駅名標ヘッダー＋3×3 ビンゴ（真ん中は FREE「途中下車」マス） | `js/bingo.js` `js/api.js` |
| 3 | マスをタップ → 詳細シート（店名・徒歩分数・Googleマップ）→ 達成ボタンでスタンプ（写真を登録するとマスに表示）。ライン成立で紙吹雪 → 自動で路線図に戻り、ハンコが降りてきてその駅のスタンプが押される | `js/bingo.js` `js/stamp.js` `js/board.js` |

## ファイル構成

```
frontend/
├─ index.html
├─ css/style.css
├─ js/
│  ├─ main.js        画面遷移・サイコロの流れ
│  ├─ board.js       スタンプラリー路線図（うねる路線・スタンプ台・コマ移動・押印演出）
│  ├─ stamp.js       駅スタンプの SVG 生成（線画 or アイコン・駅名の札・日付・インクのかすれ）
│  ├─ dice.js        CSS 3D サイコロ
│  ├─ bingo.js       ビンゴ画面・詳細シート・写真判定・クリア演出
│  ├─ api.js         API クライアント＋デモデータ
│  ├─ storage.js     localStorage 保存
│  ├─ sound.js       効果音（Web Audio で合成）
│  ├─ effects.js     紙吹雪・トースト
│  ├─ config.js      API の URL / モード
│  └─ data/
│     ├─ lines.js     デモモード用の路線と、以前の版の駅 ID・読み（JR京都線・神戸線 京都〜明石）
│     └─ stampArt.js  線画がある駅の一覧（ツールが自動で書き換え）
├─ assets/stamps/    駅スタンプの線画（白い線／黒い背景の PNG）
├─ stamp-preview.html 全駅のスタンプ確認ページ
├─ tools/            線画の一括生成ツール（バックエンド担当が Vertex AI で実行）
├─ API_CONTRACT.md   バックエンドとの API 仕様
├─ CREDITS.md        著作物利用シート（下書き）
├─ Dockerfile / nginx.conf   フロントを Cloud Run で配信する場合
```

## 駅スタンプの絵（線画）

- 線画がある駅は絵入りのスタンプ、無い駅はアイコンのスタンプになります（枠のデザインは共通）
- 線画の一覧は `js/data/stampArt.js`、画像は `assets/stamps/{駅ID}.png`（白い線／黒い背景）
- **全駅のスタンプをまとめて確認**：`http://localhost:5173/stamp-preview.html`
- **一括生成ツール**：`tools/make_stamp_art.py`（写真 → Gemini で線画 → スタンプ用画像 → 登録 まで自動）
  - 写真は `tools/photos/{駅ID}.jpg` に置く（一覧は `tools/photos/README.md`）
  - Vertex AI で一括生成：`python tools/make_stamp_art.py --project プロジェクトID`
  - Gemini アプリ等で手作業で作った線画を取り込む：`tools/raw/{駅ID}.png` に置いて `python tools/make_stamp_art.py --from-raw`
  - 絵の位置を上下に調整：`tools/stamp_frames.json` に `"駅ID": {"y": -30}` のように書いて `--register-only`

## 保存データ（localStorage）

キー `teikiSugoroku:v1` に 1 つの JSON で保存。メニュー（右上 ⋯）からリセット可能。
駅の進捗は駅 ID ごと（尼崎は京都線・神戸線で共通）。写真は 160px のサムネイルだけ保存。

## デプロイ

- 路線の色は Gemini が答えたイメージカラー（`POST /api/rail/readings`）。公式色と違うことがある
- **本番は Cloud Run の 1 サービス**：リポジトリ直下の `Dockerfile` で、バックエンドが `frontend/` も配信する（CORS 不要）。手順は `backend/README.md`

## 路線を増やすとき

`js/data/lines.js` の `LINES` に `{ id, name, section, color, stations: [...] }` を足すだけ。
駅 `id` は路線をまたいで同じ駅なら同じにする（開拓状況が共有される）。

## デモ動画撮影のコツ

- 撮影前にメニューからリセット → 何駅か `?mock=1` で開拓しておくと路線図がカラフルで映える
- サイコロ → 到着 → ビンゴ生成のローディング（「Googleマップで実在スポットを確認中…」）→ スタンプ → BINGO → 路線図塗り、が 1 本の流れで撮れる
