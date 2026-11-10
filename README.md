# 定期券すごろく

通学定期券の区間をすごろくの台紙にして、途中駅を冒険する Web アプリです。DevFest Hackathon 2026（大阪会場）チーム tamago の提出作品です。

**公開 URL：** https://teiki-sugoroku-619397307400.asia-northeast1.run.app

## 遊び方

1. 全国の鉄道から自分の定期区間を選びます。乗り換えがあっても 1 本の台紙につながります。
2. サイコロを振って、今日降りる駅を決めます。
3. 駅の周辺に実在するお店や神社をもとに、AI がビンゴカードを作ります。
4. ビンゴをそろえると、その駅のスタンプが台紙に押されます。

## 構成

- **実行基盤：** Cloud Run の 1 サービスで、FastAPI の API と画面を配信
- **生成 AI：** Vertex AI の Gemini（ミッション文、駅スタンプの線画）
- **スポット情報：** Places API (New)
- **保存：** Cloud Storage（生成したスタンプの共有）、ブラウザの localStorage（進行状況と写真）
- **路線と駅のデータ：** HeartRails Express

Gemini には Places API で取得した候補の番号を選ばせ、店名、徒歩分数、地図リンクはサーバーが実データから埋めます。候補にない番号は捨てるので、架空のお店は表示されません。

## ローカルでの実行

`backend/.env.example` を `backend/.env` にコピーして値を設定します。`.env` はコミットしないでください。

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
FRONTEND_DIR=../frontend .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8080
```

テストは `backend` で次のコマンドを実行します。

```bash
.venv/bin/python -m unittest discover -s tests
```

## ライセンス

[MIT License](LICENSE) です。使用している素材は [frontend/CREDITS.md](frontend/CREDITS.md) を参照してください。
