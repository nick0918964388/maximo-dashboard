/**
 * shared.js — 三頁共用工具函式 + trainStations
 */

// ═══════════════════════════════════════════
// 車型判別 / 標籤 / 顏色
// ═══════════════════════════════════════════

function getType(id) {
  if (id.startsWith('EMU')) return 'emu';
  if (id.startsWith('DR')) return 'dr';
  if (/^\d{3,4}$/.test(id)) return 'pp';
  if (id.startsWith('FPK')) return 'ck';
  return 'e';
}

function getTypeLabel(type) {
  return { e: '電力機車', emu: '電聯車', dr: '柴油客車', pp: 'PP客車', ck: '莒光號' }[type] || type;
}

function getTypeLabelFull(type) {
  const labels = { e: 'E 系列 — 電力機車', emu: 'EMU 系列 — 電聯車', dr: 'DR 系列 — 柴油客車', pp: 'PP 系列 — PP客車', ck: 'FPK 系列 — 莒光號' };
  return labels[type] || type;
}

function getTypeColor(type) {
  return { e: 'var(--color-e)', emu: 'var(--color-emu)', dr: 'var(--color-dr)', pp: 'var(--color-pp)', ck: 'var(--color-ck)' }[type];
}

function getTypeColorHex(type) {
  const cs = getComputedStyle(document.documentElement);
  return {
    e: cs.getPropertyValue('--color-e').trim(),
    emu: cs.getPropertyValue('--color-emu').trim(),
    dr: cs.getPropertyValue('--color-dr').trim(),
    pp: cs.getPropertyValue('--color-pp').trim(),
    ck: cs.getPropertyValue('--color-ck').trim()
  }[type];
}

// ═══════════════════════════════════════════
// ID / 排序 / 控制模式
// ═══════════════════════════════════════════

function extractNumeric(id) {
  const m = id.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

function sortByVehicleId(a, b) {
  const parseId = (id) => {
    const match = id.match(/^([A-Z]+)(\d+)/);
    if (!match) return { prefix: id, num: 0 };
    return { prefix: match[1], num: parseInt(match[2], 10) };
  };
  const pa = parseId(a), pb = parseId(b);
  if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix);
  return pa.num - pb.num;
}

function getCtrlLabel(ctrl) {
  return { A: '主控', B: '被控', C: '輔助' }[ctrl] || ctrl;
}

// ═══════════════════════════════════════════
// 日期格式轉換
// ═══════════════════════════════════════════

/** Mock 用 '2026/02/24' → API 用 '2026-02-24' */
function toISODate(slashDate) {
  return slashDate.replace(/\//g, '-');
}

/** API 用 '2026-02-24' → Mock 用 '2026/02/24' */
function toSlashDate(isoDate) {
  return isoDate.replace(/-/g, '/');
}

/** 取得今日日期字串（ISO 格式） */
function getTodayISO() {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

/** 取得今日日期字串（Slash 格式） */
function getTodaySlash() {
  return toSlashDate(getTodayISO());
}

// ═══════════════════════════════════════════
// Loading / Error UI
// ═══════════════════════════════════════════

/**
 * 在容器中顯示 Loading 狀態
 * @param {string} containerId - DOM 元素 ID
 * @param {string} [message='載入中...'] - 顯示文字
 */
function showLoading(containerId, message = '載入中...') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;padding:40px;gap:12px;color:var(--text-secondary,#94a3b8);">
      <svg width="24" height="24" viewBox="0 0 24 24" style="animation:spin 1s linear infinite;">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="31 31" stroke-linecap="round"/>
      </svg>
      <span>${message}</span>
    </div>
  `;
}

/**
 * 在容器中顯示錯誤訊息 + 重試按鈕
 * @param {string} containerId - DOM 元素 ID
 * @param {string} message - 錯誤訊息
 * @param {Function} [retryFn] - 重試回呼
 */
function showError(containerId, message, retryFn) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const retryBtn = retryFn
    ? `<button onclick="(${retryFn.toString()})()" style="margin-top:12px;padding:8px 20px;border:1px solid var(--accent,#e8a849);color:var(--accent,#e8a849);background:transparent;border-radius:8px;cursor:pointer;font-size:14px;">重試</button>`
    : '';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;color:var(--text-secondary,#94a3b8);text-align:center;">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4m0 4h.01"/></svg>
      <p style="margin:12px 0 0;font-size:15px;">${message}</p>
      ${retryBtn}
    </div>
  `;
}

/**
 * 顯示 Fallback Banner（API 失敗，已切換到 Mock 模式）
 */
function showFallbackBanner() {
  if (document.getElementById('vdash-fallback-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'vdash-fallback-banner';
  banner.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#f59e0b;color:#000;text-align:center;padding:8px 16px;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;">
      <span>⚠️ API 連線失敗，目前顯示為模擬資料</span>
      <button onclick="dataService.retryConnection().then(()=>location.reload())" style="padding:4px 12px;border:1px solid #000;background:transparent;border-radius:4px;cursor:pointer;font-size:13px;">重新連線</button>
      <button onclick="this.parentElement.parentElement.remove()" style="padding:4px 8px;border:none;background:transparent;cursor:pointer;font-size:16px;">✕</button>
    </div>
  `;
  document.body.prepend(banner);
}

/** 移除 Fallback Banner */
function hideFallbackBanner() {
  const banner = document.getElementById('vdash-fallback-banner');
  if (banner) banner.remove();
}

// ═══════════════════════════════════════════
// trainStations 車次站名對照表（純前端展示用）
// ═══════════════════════════════════════════
const trainStations = {
  '7035': { from: '七堵', to: '樹林' }, '7036': { from: '樹林', to: '七堵' },
  '7503A': { from: '七堵', to: '松山' }, '7557': { from: '松山', to: '基隆' },
  '7538A': { from: '七堵', to: '彰化' }, '7538': { from: '彰化', to: '七堵' },
  '7350A': { from: '七堵', to: '蘇澳' }, '7350': { from: '蘇澳', to: '花蓮' },
  '7351': { from: '花蓮', to: '蘇澳' }, '7532': { from: '蘇澳', to: '七堵' },
  '7353': { from: '七堵', to: '蘇澳' }, '7354': { from: '蘇澳', to: '七堵' },
  '7355': { from: '七堵', to: '松山' }, '7356': { from: '松山', to: '七堵' },
  '7503S': { from: '七堵', to: '樹林' }, '7503': { from: '樹林', to: '新竹' },
  '7503B': { from: '新竹', to: '七堵' }, '7404': { from: '七堵', to: '竹南' },
  '7535': { from: '竹南', to: '七堵' }, '7359B': { from: '花蓮', to: '七堵' },
  '1A': { from: '七堵', to: '松山' }, '1': { from: '松山', to: '高雄' },
  '1B': { from: '高雄', to: '屏東' }, '1N': { from: '屏東', to: '潮州' },
  '2S': { from: '潮州', to: '高雄' }, '2A': { from: '高雄', to: '臺中' },
  '2': { from: '臺中', to: '臺北' }, '2B': { from: '臺北', to: '七堵' },
  '6032': { from: '七堵', to: '七堵' },
  '145': { from: '南港', to: '左營' }, '110': { from: '左營', to: '南港' },
  '133': { from: '南港', to: '左營' }, '116': { from: '左營', to: '南港' },
  '117A': { from: '南港', to: '板橋' }, '117': { from: '板橋', to: '左營' },
  '146': { from: '左營', to: '南港' }, '111': { from: '南港', to: '左營' },
  '132': { from: '左營', to: '南港' }, '127': { from: '南港', to: '臺東' },
  '148': { from: '臺東', to: '南港' }, '193': { from: '南港', to: '花蓮' },
  '194': { from: '花蓮', to: '南港' },
  '4715': { from: '七堵', to: '瑞芳' }, '4722': { from: '瑞芳', to: '七堵' },
  '4706': { from: '七堵', to: '蘇澳' }, '4714': { from: '蘇澳', to: '七堵' },
  // 臺北
  '1101': { from: '臺北', to: '花蓮' }, '1102': { from: '花蓮', to: '臺北' },
  '1103': { from: '臺北', to: '宜蘭' }, '1104': { from: '宜蘭', to: '臺北' },
  '1105': { from: '臺北', to: '瑞芳' }, '1106': { from: '瑞芳', to: '臺北' },
  '175': { from: '南港', to: '臺東' }, '176': { from: '臺東', to: '南港' },
  '281': { from: '臺北', to: '新竹' }, '282': { from: '新竹', to: '臺北' },
  '283': { from: '臺北', to: '桃園' }, '284': { from: '桃園', to: '臺北' },
  // 新竹
  '2201': { from: '新竹', to: '竹南' }, '2202': { from: '竹南', to: '新竹' },
  '2203': { from: '新竹', to: '苗栗' }, '2204': { from: '苗栗', to: '新竹' },
  '561': { from: '新竹', to: '臺中' }, '562': { from: '臺中', to: '新竹' },
  // 彰化
  '3301': { from: '彰化', to: '員林' }, '3302': { from: '員林', to: '彰化' },
  '3303': { from: '彰化', to: '二水' }, '3304': { from: '二水', to: '彰化' },
  '671': { from: '彰化', to: '臺中' }, '672': { from: '臺中', to: '彰化' },
  // 嘉義
  '4401': { from: '嘉義', to: '新營' }, '4402': { from: '新營', to: '嘉義' },
  '4403': { from: '嘉義', to: '斗六' }, '4404': { from: '斗六', to: '嘉義' },
  // 高雄
  '5501': { from: '高雄', to: '屏東' }, '5502': { from: '屏東', to: '高雄' },
  '5503': { from: '高雄', to: '臺南' }, '5504': { from: '臺南', to: '高雄' },
  '5505': { from: '高雄', to: '潮州' }, '5506': { from: '潮州', to: '高雄' },
  '371': { from: '高雄', to: '臺東' }, '372': { from: '臺東', to: '高雄' },
  // 花蓮
  '6601': { from: '花蓮', to: '臺東' }, '6602': { from: '臺東', to: '花蓮' },
  '6603': { from: '花蓮', to: '玉里' }, '6604': { from: '玉里', to: '花蓮' },
  '6605': { from: '花蓮', to: '壽豐' }, '6606': { from: '壽豐', to: '花蓮' },
  // 台中
  '7701': { from: '臺中', to: '彰化' }, '7702': { from: '彰化', to: '臺中' },
  '7703': { from: '臺中', to: '豐原' }, '7704': { from: '豐原', to: '臺中' },
  '7705': { from: '臺中', to: '新竹' }, '7706': { from: '新竹', to: '臺中' },
};

// Loading spinner CSS（注入一次）
(function injectSharedStyles() {
  if (document.getElementById('vdash-shared-styles')) return;
  const style = document.createElement('style');
  style.id = 'vdash-shared-styles';
  style.textContent = `
    @keyframes spin { to { transform: rotate(360deg); } }
  `;
  document.head.appendChild(style);
})();
