/**
 * api-client.js — MaximoAPI class
 * 依 API_DESIGN.md §6.1 實作，含 retry（4xx 不重試，5xx 最多重試 N 次）
 */

class APIError extends Error {
  constructor(status, code, message) {
    super(message || `API Error ${status}`);
    this.name = 'APIError';
    this.status = status;
    this.code = code;
  }
}

class MaximoAPI {
  constructor(config) {
    const apiCfg = config || VDASH_CONFIG.api;
    this.baseUrl = apiCfg.baseUrl;
    this.timeout = apiCfg.timeout || 15000;
    this.retryCount = apiCfg.retryCount || 2;
    this.retryDelay = apiCfg.retryDelay || 1000;
    this.headers = { ...(apiCfg.headers || {}) };
    if (apiCfg.apiKey) {
      this.headers['apikey'] = apiCfg.apiKey;
    }
  }

  /**
   * 核心 fetch 方法，含 retry 邏輯
   * @param {string} endpoint - API 端點路徑（如 '/depots'）
   * @param {Object} params - query 參數
   * @param {Object} [options] - fetch options override
   * @returns {Promise<Object>} parsed JSON
   */
  async _fetch(endpoint, params = {}, options = {}) {
    const url = new URL(this.baseUrl + endpoint, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });

    let lastError;
    for (let attempt = 0; attempt <= this.retryCount; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const res = await fetch(url.toString(), {
          method: options.method || 'GET',
          headers: { ...this.headers, ...(options.headers || {}) },
          body: options.body || undefined,
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          const apiErr = new APIError(
            res.status,
            errBody.error?.code || 'unknown',
            errBody.error?.message || `HTTP ${res.status}`
          );
          // 4xx 不重試
          if (res.status >= 400 && res.status < 500) {
            throw apiErr;
          }
          lastError = apiErr;
          // 5xx 重試
          if (attempt < this.retryCount) {
            await this._sleep(this.retryDelay * (attempt + 1));
            continue;
          }
          throw apiErr;
        }

        return await res.json();
      } catch (err) {
        if (err instanceof APIError) {
          lastError = err;
          // 4xx 直接拋出
          if (err.status >= 400 && err.status < 500) throw err;
        } else if (err.name === 'AbortError') {
          lastError = new APIError(408, 'timeout', '請求逾時');
        } else {
          lastError = new APIError(0, 'network_error', err.message || '網路錯誤');
        }

        if (attempt < this.retryCount) {
          await this._sleep(this.retryDelay * (attempt + 1));
          continue;
        }
      }
    }
    throw lastError;
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ══════════════════════════════════════════
  // Page: index.html
  // ══════════════════════════════════════════

  /** 機務段清單 */
  getDepots() {
    return this._fetch('/depots');
  }

  /** 艦隊摘要 */
  getFleetSummary(depot, date) {
    return this._fetch('/fleet-summary', { depot, date });
  }

  /** 當日運用明細 */
  getDailyOps(depot, date, type = 'all') {
    return this._fetch('/daily-ops', { depot, date, type });
  }

  /** 查詢場段最近有資料的日期 */
  getLatestDataDate(depot) {
    return this._fetch('/latest-data-date', { depot });
  }

  // ══════════════════════════════════════════
  // Page: vehicle-status.html
  // ══════════════════════════════════════════

  /** 全車狀態總覽 */
  getVehicleStatus(type = 'all', depot = 'all') {
    return this._fetch('/vehicle-status', { type, depot });
  }

  // ══════════════════════════════════════════
  // Page: vehicle-history.html
  // ══════════════════════════════════════════

  /** 車輛基本資料 + 運用紀錄 */
  getVehicleDetail(assetnum, days = 30) {
    return this._fetch('/vehicle-detail', { assetnum, days });
  }

  /** 保養維修紀錄 */
  getMaintHistory(assetnum, days = 90) {
    return this._fetch('/maint-history', { assetnum, days });
  }

  /** 故障紀錄 */
  getFaultHistory(assetnum, days = 180) {
    return this._fetch('/fault-history', { assetnum, days });
  }

  /** 維修可靠度 KPI */
  getVehicleKPI(assetnum, period = 365) {
    return this._fetch('/vehicle-kpi', { assetnum, period });
  }

  // ══════════════════════════════════════════
  // Page: train-map.html
  // ══════════════════════════════════════════

  /** 車組行程追蹤 */
  getTrainTracking(date, vehicle = null, depot = null) {
    const params = { date };
    if (vehicle) params.vehicle = vehicle;
    if (depot && depot !== 'all') params.depot = depot;
    return this._fetch('/train-tracking', params);
  }

  // ══════════════════════════════════════════
  // Action
  // ══════════════════════════════════════════

  /** 開立動態回報 */
  submitDynamicReport(payload) {
    return this._fetch('/dynamic-report', {}, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }
}
