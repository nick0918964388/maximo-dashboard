/**
 * data-service.js — DataService（核心路由）
 *
 * 依 VDASH_CONFIG.mode 選擇 MaximoAPI 或 MockAPI
 * API 失敗時自動 fallback 到 MockAPI + 顯示黃色 banner
 */

class DataService {
  constructor() {
    this._apiClient = new MaximoAPI();
    this._mockClient = new MockAPI();
    this._isFallback = false;
    this._mode = VDASH_CONFIG.mode; // 'mock' | 'api'
  }

  /** 目前使用的模式 */
  get mode() {
    return this._isFallback ? 'fallback' : this._mode;
  }

  /** 是否處於 fallback 模式 */
  get isFallback() {
    return this._isFallback;
  }

  /**
   * 核心路由：呼叫 API 或 Mock
   * @param {string} method - 方法名稱
   * @param {Array} args - 參數
   */
  async _call(method, args) {
    // Mock 模式直接用 MockAPI
    if (this._mode === 'mock') {
      return this._mockClient[method](...args);
    }

    // API 模式：嘗試 MaximoAPI
    try {
      const result = await this._apiClient[method](...args);
      // 成功：若之前 fallback，恢復正常
      if (this._isFallback) {
        this._isFallback = false;
        hideFallbackBanner();
        console.info('[DataService] API 連線恢復');
      }
      return result;
    } catch (err) {
      console.error(`[DataService] API ${method} 失敗:`, err.message);

      // 4xx 客戶端錯誤不 fallback，直接拋出
      if (err instanceof APIError && err.status >= 400 && err.status < 500) {
        throw err;
      }

      // 5xx / 網路錯誤 → fallback 到 Mock
      if (VDASH_CONFIG.fallback.enabled) {
        if (!this._isFallback) {
          this._isFallback = true;
          console.warn('[DataService] 切換到 Fallback Mock 模式');
          showFallbackBanner();
        }
        return this._mockClient[method](...args);
      }

      // fallback 未啟用，直接拋出
      throw err;
    }
  }

  /**
   * 重新連線 API（從 fallback banner 呼叫）
   * @returns {Promise<boolean>} 是否成功恢復
   */
  async retryConnection() {
    try {
      // 用最輕量的 API 測試連線
      await this._apiClient.getDepots();
      this._isFallback = false;
      hideFallbackBanner();
      console.info('[DataService] API 重新連線成功');
      return true;
    } catch (err) {
      console.warn('[DataService] API 仍然無法連線:', err.message);
      return false;
    }
  }

  // ══════════════════════════════════════════
  // Page: index.html
  // ══════════════════════════════════════════

  getDepots() {
    return this._call('getDepots', []);
  }

  getFleetSummary(depot, date) {
    return this._call('getFleetSummary', [depot, date]);
  }

  getDailyOps(depot, date, type = 'all') {
    return this._call('getDailyOps', [depot, date, type]);
  }

  getLatestDataDate(depot) {
    return this._call('getLatestDataDate', [depot]);
  }

  // ══════════════════════════════════════════
  // Page: vehicle-status.html
  // ══════════════════════════════════════════

  getVehicleStatus(type = 'all', depot = 'all') {
    return this._call('getVehicleStatus', [type, depot]);
  }

  // ══════════════════════════════════════════
  // Page: vehicle-history.html
  // ══════════════════════════════════════════

  getVehicleDetail(assetnum, days = 30) {
    return this._call('getVehicleDetail', [assetnum, days]);
  }

  getMaintHistory(assetnum, days = 90) {
    return this._call('getMaintHistory', [assetnum, days]);
  }

  getFaultHistory(assetnum, days = 180) {
    return this._call('getFaultHistory', [assetnum, days]);
  }

  getVehicleKPI(assetnum, period = 365) {
    return this._call('getVehicleKPI', [assetnum, period]);
  }

  // ══════════════════════════════════════════
  // Action
  // ══════════════════════════════════════════

  submitDynamicReport(payload) {
    return this._call('submitDynamicReport', [payload]);
  }
}

// ═══════════════════════════════════════════
// 全域實例（頁面載入即可用）
// ═══════════════════════════════════════════
const dataService = new DataService();
