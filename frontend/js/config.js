// ===== フロントエンド設定 =====
// バックエンドが Cloud Run に上がったら API_BASE_URL を差し替える。
//   例: "https://teiki-backend-xxxxx-an.a.run.app"
// 空文字 "" のときは同じオリジン（/api/...）に投げる。
//
// MODE:
//   "auto" … API を叩いて、失敗したらデモデータに自動フォールバック（開発中おすすめ）
//   "api"  … API のみ（失敗したらエラー表示）。本番・審査デモ用
//   "mock" … 常にデモデータ（バックエンド無しで UI だけ確認したいとき）
//
// URL に ?mock=1 を付けると一時的に "mock" になる。?api=https://... で API_BASE_URL を上書きできる。

const params = new URLSearchParams(location.search);

export const CONFIG = {
  API_BASE_URL: params.get("api") ?? "",
  MODE: params.get("mock") === "1" ? "mock" : "api",
  // Gemini の生成は数秒〜十数秒かかるので長めに
  MISSIONS_TIMEOUT_MS: 30000,
};
