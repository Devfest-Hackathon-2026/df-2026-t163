# フロント ⇄ バックエンド API 仕様（v1）

フロント側の実装は `frontend/js/api.js`。この形で返してもらえればそのまま表示されます。
多少崩れた JSON でもフロントで整形（`normalizeMission`）するので落ちませんが、なるべくこの形でお願いします。

- すべて `POST` / `Content-Type: application/json`
- フロントとバックエンドを別々の Cloud Run サービスにする場合は **CORS を許可**してください
  （`Access-Control-Allow-Origin` にフロントの URL、`OPTIONS` のプリフライトにも 204 で応答）
- フロントのタイムアウトは 30 秒

---

## 1. `POST /api/missions` — ビンゴ用ミッション生成

Places API で駅周辺の実在スポットを取得 → Gemini（Structured Outputs）でミッション化 → 返す。

### Request

```json
{
  "lineId": "jr-kyoto-kobe",
  "lineName": "JR京都線・神戸線",
  "stationId": "takatsuki",
  "stationName": "高槻",
  "timeMinutes": 60
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `stationName` | string | 駅名（「駅」は付かない）。私鉄・地下鉄・モノレールの駅も来る |
| `timeMinutes` | 30 \| 60 \| 90 \| 120 | 残り時間。徒歩圏の目安：30分→徒歩5分以内、60分→10分以内、90分以上→15分以内 |
| `lat` / `lng` | number | 駅の座標（定期区間えらびの駅データから）。あれば駅の検索を省く |

### Response

```json
{
  "missions": [
    {
      "id": "m1",
      "title": "パンをひとつ買う",
      "description": "駅から徒歩3分の〇〇ベーカリーで、気になるパンをひとつ買ってみよう。",
      "spotName": "〇〇ベーカリー",
      "category": "bakery",
      "walkMinutes": 3,
      "placeId": "ChIJxxxxxxxx",
      "mapsUrl": "https://www.google.com/maps/search/?api=1&query=...&query_place_id=ChIJxxxxxxxx",
      "photoHint": ""
    }
  ],
  "stamp": { "category": "shrine", "label": "〇〇神社" },
  "note": "任意。デバッグ用メッセージ"
}
```

- **`stamp`（任意）**：ビンゴ達成時に路線図へ押す「駅スタンプ」の絵柄。`category` は下の表と同じ enum、
  `label` はその駅を代表する実在スポット名（Places から）。無ければフロントが「最初にそろったラインで達成したスポット」から自動で決めます。

- **`missions` は 8 個**。フロントが真ん中（FREEマス「〇〇駅で途中下車！」）を自動で差し込んで 3×3 にします。
  9 個返した場合はそのまま 9 マスとして使います。
- 足りないときはフロント側でデモ用ミッションで埋めます（ただし審査デモでは 8 個そろえてください）。

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | string | ○ | 一意な ID（何でもよい） |
| `title` | string | ○ | マスに出る短い文。**全角 12 文字前後**が見やすい（最大 40） |
| `description` | string | ○ | 詳細シートの説明。最大 200 文字 |
| `spotName` | string | ○ | **Places API から取った実在の名前**（Gemini に作らせない） |
| `category` | enum | ○ | `food` `cafe` `sweets` `bakery` `park` `shrine` `shop` `view` `culture` `bench` `other` のどれか（アイコンになる） |
| `walkMinutes` | number | ○ | 駅からの徒歩分数（0 なら「駅すぐ」表示）。距離 ÷ 80m/分 で計算でOK |
| `placeId` | string | 推奨 | Places の place_id |
| `mapsUrl` | string | 任意 | 無ければフロントが `spotName` + `placeId` から Google マップ URL を作る |
| `photoHint` | string | 任意 | 写真に残すと楽しいミッションのヒント（例：「鳥居を入れて撮ってね」） |

### Gemini の responseSchema 例（Vertex AI / gemini-3.5-flash-lite）

```json
{
  "type": "OBJECT",
  "properties": {
    "missions": {
      "type": "ARRAY",
      "minItems": 8,
      "maxItems": 8,
      "items": {
        "type": "OBJECT",
        "properties": {
          "id": { "type": "STRING" },
          "title": { "type": "STRING" },
          "description": { "type": "STRING" },
          "placeId": { "type": "STRING" },
          "category": { "type": "STRING", "enum": ["food","cafe","sweets","bakery","park","shrine","shop","view","culture","bench","other"] },
          "photoHint": { "type": "STRING" }
        },
        "required": ["id","title","description","placeId","category"]
      }
    }
  },
  "required": ["missions"]
}
```

> ハルシネーション対策のおすすめ：Gemini には `placeId` だけ選ばせて、`spotName` / `walkMinutes` / `mapsUrl` は
> バックエンド側で Places のデータから**後から埋める**。Gemini が返した `placeId` が候補リストに無ければ捨てる。
> こうすると「存在しない店」が画面に出ることが構造的に起きない（設計ドキュメントのアピールポイント）。

---

## エラー時

- HTTP 4xx/5xx を返せば OK。フロントは `MODE: "auto"` ならデモデータにフォールバック、`"api"` ならエラートーストを出します。
