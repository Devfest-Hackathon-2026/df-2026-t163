# 定期券すごろく＆駅ビンゴ — backend

FastAPI + Places API (New) + Vertex AI（gemini-3.5-flash-lite）。Cloud Run で動かす。
API の形はフロントと決めた **`frontend/API_CONTRACT.md`** のとおり。

| エンドポイント | 内容 |
|---|---|
| `POST /api/missions` | 駅周辺の実在スポットを Places で取得 → Gemini で 8 個のミッション（＋駅スタンプの絵柄）を生成 |
| `GET /api/rail/lines` `/stations` `/nearby` | 全国の路線・駅データ（HeartRails Express、バスは除く） |
| `POST /api/rail/readings` | 駅名のひらがな・ローマ字を Gemini で付ける |
| `POST /api/stamp-art` | 駅スタンプの線画。実在の駅か確かめたうえで、Cloud Storage に共有済みならそれを返し、無ければ生成して保存（1 日の生成数に上限あり） |
| `GET /healthz` | 設定の確認（キーやプロジェクトが入っているか） |

## しくみ（設計ドキュメント用メモ）

1. **駅の位置**：`JR〇〇駅` を Places Text Search（`includedType: train_station`）で検索して緯度経度を取る（駅ごとにメモリにキャッシュ）
2. **周辺スポット**：Nearby Search（カフェ・パン屋・公園・博物館など）＋ Text Search（「神社 お寺」「スイーツ 和菓子」「商店街」）を**並列**で実行
   - 徒歩圏は残り時間で決める（30分→徒歩5分、60分→10分、90分以上→15分）
   - 閉店・駅そのもの・範囲外を除外 → 口コミ数順 → ジャンルが偏らないように最大 30 件
3. **Gemini（Structured Outputs）**：候補を `p1, p2, ...` の ref 付きで渡し、**ref だけ選ばせて**ミッション文を書かせる
4. **ハルシネーション対策**：店名・徒歩分数・マップ URL・placeId は**バックエンドが Places のデータから埋める**。
   候補に無い ref・重複は捨て、足りない分は実在スポットからテンプレートで補う
   → 存在しない店が画面に出ることが構造的に起きない
5. Gemini が失敗しても、実在スポットのテンプレートミッションで 8 個返す（`note` に理由が入る）

## ローカルで動かす

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # MAPS_API_KEY と GOOGLE_CLOUD_PROJECT を入れる
gcloud auth application-default login   # Vertex AI 用の認証（初回だけ）

# まずはターミナルで 1 駅試す
python -m scripts.try_missions 高槻 --places-only   # Places の取得だけ
python -m scripts.try_missions 高槻                 # ミッション生成まで

# API サーバー
uvicorn app.main:app --reload --port 8080
```

フロントからつなぐ：`frontend` を `python3 -m http.server 5173` で開き、
`http://localhost:5173/?api=http://localhost:8080` にアクセス。

`.env` に `FRONTEND_DIR=../frontend` を入れると、`http://localhost:8080/` でフロントも一緒に配信される（CORS 不要）。

## テスト（外部 API は呼ばない）

```bash
python -m unittest discover -s tests
```

## 事前準備（Google Cloud）

- API を有効化：**Vertex AI API**、Places API (New)、Cloud Run Admin API、Cloud Build API
- Maps の API キーは「Places API (New)」だけに制限する
- Cloud Run のサービスアカウントに **Vertex AI ユーザー**（`roles/aiplatform.user`）を付ける（`roles/editor` があれば不要）

## Cloud Run にデプロイ

リポジトリ直下の `Dockerfile` で、API とフロントを 1 つのサービスにまとめて動かす（同じオリジンなので CORS と `API_BASE_URL` の設定は不要）。

```bash
# 最初の 1 回だけ
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com
printf '%s' 'AIza...' | gcloud secrets create maps-api-key --data-file=-
gcloud secrets add-iam-policy-binding maps-api-key \
  --member=serviceAccount:<PROJECT_NUMBER>-compute@developer.gserviceaccount.com \
  --role=roles/secretmanager.secretAccessor

gcloud storage buckets create gs://<PROJECT_ID>-stamps --location asia-northeast1 --uniform-bucket-level-access --public-access-prevention

# デプロイ（リポジトリ直下で実行）
gcloud run deploy teiki-sugoroku --source . --region asia-northeast1 --allow-unauthenticated --max-instances 3 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=<PROJECT_ID>,GOOGLE_CLOUD_LOCATION=global,ALLOWED_ORIGINS=,STAMP_BUCKET=<PROJECT_ID>-stamps" \
  --set-secrets MAPS_API_KEY=maps-api-key:latest
```

`--source .` は手元のファイルをそのままアップロードする（未コミットの変更も入る）。アップロード対象は `.gcloudignore` で制御している。

## ファイル

```
backend/
├─ app/
│  ├─ main.py      FastAPI（ルーティング・CORS・エラー）
│  ├─ places.py    Places API (New)：駅の位置・周辺スポット・カテゴリ判定・徒歩分数
│  ├─ missions.py  プロンプト・Gemini 出力の検証と組み立て・テンプレート補完
│  ├─ gemini.py    Vertex AI クライアント（Structured Outputs）
│  ├─ schemas.py   入出力と Gemini の responseSchema（Pydantic）
│  └─ config.py    環境変数
├─ scripts/try_missions.py  ターミナルで試す用
├─ tests/test_logic.py
├─ requirements.txt / Dockerfile / .env.example
```
