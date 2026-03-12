/**
 * VDASH_CONFIG — 台鐵車輛儀表板 API 設定
 *
 * mode: 'mock' → 使用前端 MockAPI（開發/離線）
 * mode: 'api'  → 呼叫 Maximo Autoscript REST API
 */
const VDASH_CONFIG = {
  // ── 運行模式 ──
  // 'mock' = 前端模擬資料（不需 Maximo）
  // 'api'  = 連接 Maximo REST API
  mode: 'mock',

  // ── API 連線設定 ──
  api: {
    // 透過 Nginx Reverse Proxy（建議）
    baseUrl: '/api/v1',
    // 若同域直連 Maximo，改用：
    // baseUrl: '/maximo/oslc/script',

    // 請求逾時（毫秒）
    timeout: 15000,

    // 重試設定（僅 5xx 錯誤重試）
    retryCount: 2,
    retryDelay: 1000,

    // API Key（由 Proxy 注入，前端通常不需設定）
    // 若需前端直連，取消註解：
    // apiKey: 'your-maximo-api-key',

    headers: {
      'Accept': 'application/json'
    }
  },

  // ── Mock 設定 ──
  mock: {
    // 模擬網路延遲（毫秒）
    delay: 300,
    // 模擬隨機失敗率 (0~1)，0 = 不失敗
    failureRate: 0
  },

  // ── 自動 Fallback ──
  fallback: {
    // API 失敗時自動切換到 Mock
    enabled: true,
    // 顯示 fallback banner 的持續時間（毫秒），0 = 永久顯示
    bannerDuration: 0
  }
};

// 防止意外修改
if (typeof Object.freeze === 'function') {
  Object.freeze(VDASH_CONFIG.api);
  Object.freeze(VDASH_CONFIG.mock);
  Object.freeze(VDASH_CONFIG.fallback);
}
