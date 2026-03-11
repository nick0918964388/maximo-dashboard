/**
 * mock-data.js — MockAPI class
 * 與 MaximoAPI 相同介面，回傳格式與 API_DESIGN.md 一致
 * 集中三頁的 mock 資料
 */

class MockAPI {
  constructor() {
    this._delay = VDASH_CONFIG.mock.delay || 300;
    this._failureRate = VDASH_CONFIG.mock.failureRate || 0;
  }

  async _simulate() {
    await new Promise(r => setTimeout(r, this._delay));
    if (this._failureRate > 0 && Math.random() < this._failureRate) {
      throw new APIError(500, 'mock_failure', '模擬 API 失敗');
    }
  }

  // ══════════════════════════════════════════
  // GET /depots
  // ══════════════════════════════════════════
  async getDepots() {
    await this._simulate();
    const data = Object.entries(MOCK_DEPOT_META).map(([code, m]) => ({
      code,
      name: m.name,
      location: m.location,
      vehicleCount: this._countVehicles(code),
      availabilityRate: parseFloat(m.rate) || 98.0,
      pendingMaintenance: m.pending || 0
    }));
    return {
      data,
      meta: { total: data.length, cached: true, generatedAt: new Date().toISOString() }
    };
  }

  _countVehicles(depotCode) {
    const depotData = MOCK_ALL_DATA[depotCode];
    if (!depotData) return 0;
    const ids = new Set();
    Object.values(depotData).forEach(dayArr => dayArr.forEach(v => ids.add(v.id)));
    return ids.size;
  }

  // ══════════════════════════════════════════
  // GET /fleet-summary
  // ══════════════════════════════════════════
  async getFleetSummary(depot, date) {
    await this._simulate();
    const dateKey = date ? toSlashDate(date) : '2026/02/24';
    const vehicles = (MOCK_ALL_DATA[depot] && MOCK_ALL_DATA[depot][dateKey]) || [];
    const meta = MOCK_DEPOT_META[depot] || { name: depot };

    const byTypeMap = {};
    let totalMileage = 0;
    vehicles.forEach(v => {
      const t = getType(v.id);
      if (!byTypeMap[t]) byTypeMap[t] = { type: t, typeLabel: getTypeLabel(t), count: 0, active: 0, totalMileage: 0 };
      byTypeMap[t].count++;
      byTypeMap[t].active++;
      byTypeMap[t].totalMileage += v.mileage || 0;
      totalMileage += v.mileage || 0;
    });

    const byType = Object.values(byTypeMap).map(bt => ({
      ...bt,
      totalMileage: Math.round(bt.totalMileage * 10) / 10,
      avgMileage: bt.active > 0 ? Math.round(bt.totalMileage / bt.active * 10) / 10 : 0
    }));

    return {
      data: {
        depot: { code: depot, name: meta.name },
        date: date || toISODate(dateKey),
        summary: {
          totalVehicles: vehicles.length,
          activeVehicles: vehicles.length,
          totalMileage: Math.round(totalMileage * 10) / 10,
          avgMileagePerVehicle: vehicles.length > 0 ? Math.round(totalMileage / vehicles.length * 10) / 10 : 0
        },
        byType
      }
    };
  }

  // ══════════════════════════════════════════
  // GET /daily-ops
  // ══════════════════════════════════════════
  async getDailyOps(depot, date, type = 'all') {
    await this._simulate();
    const dateKey = date ? toSlashDate(date) : '2026/02/24';
    let vehicles = (MOCK_ALL_DATA[depot] && MOCK_ALL_DATA[depot][dateKey]) || [];

    if (type !== 'all') {
      vehicles = vehicles.filter(v => getType(v.id) === type);
    }

    const mapped = vehicles.map(v => {
      const t = getType(v.id);
      return {
        id: v.id,
        type: t,
        typeLabel: getTypeLabel(t),
        ctrl: v.ctrl,
        ctrlLabel: getCtrlLabel(v.ctrl),
        opCode: v.opCode,
        ma: v.ma,
        trains: v.trains,
        start: v.start,
        end: v.end,
        mileage: v.mileage,
        days: v.days,
        status: 'operating',
        startTrain: v.startTrain || v.trains[0],
        endTrain: v.endTrain || v.trains[v.trains.length - 1]
      };
    });

    return {
      data: {
        date: date || toISODate(dateKey),
        depot,
        vehicles: mapped
      },
      meta: {
        total: mapped.length,
        filtered: mapped.length,
        generatedAt: new Date().toISOString()
      }
    };
  }

  // ══════════════════════════════════════════
  // GET /latest-data-date
  // ══════════════════════════════════════════
  async getLatestDataDate(depot) {
    await this._simulate();
    const depotData = MOCK_ALL_DATA[depot];
    if (!depotData) return { data: { date: null } };
    const dates = Object.keys(depotData).sort().reverse();
    // 回傳最近有資料的日期（ISO 格式）
    return { data: { date: dates.length > 0 ? toISODate(dates[0]) : null } };
  }

  // ══════════════════════════════════════════
  // GET /vehicle-status
  // ══════════════════════════════════════════
  async getVehicleStatus(type = 'all', depot = 'all') {
    await this._simulate();

    // 收集所有不重複的車輛 ID
    const vehicleMap = {}; // id → { depot, type }
    const depotCodes = depot === 'all' ? Object.keys(MOCK_ALL_DATA) : [depot];

    depotCodes.forEach(dc => {
      const depotData = MOCK_ALL_DATA[dc];
      if (!depotData) return;
      Object.values(depotData).forEach(dayArr => {
        dayArr.forEach(v => {
          if (!vehicleMap[v.id]) {
            vehicleMap[v.id] = { depot: dc, depotName: (MOCK_DEPOT_META[dc] || {}).name || dc };
          }
        });
      });
    });

    // 建構 byType
    const byTypeMap = {};
    Object.entries(vehicleMap).forEach(([id, info]) => {
      const t = getType(id);
      if (type !== 'all' && t !== type) return;

      if (!byTypeMap[t]) {
        byTypeMap[t] = { type: t, typeLabel: getTypeLabel(t), total: 0, green: 0, yellow: 0, red: 0, vehicles: [] };
      }

      const status = _mockGetVehicleStatus(id);
      byTypeMap[t].total++;
      if (status.color === 'green') byTypeMap[t].green++;
      else if (status.color === 'yellow') byTypeMap[t].yellow++;
      else byTypeMap[t].red++;

      byTypeMap[t].vehicles.push({
        id,
        status: status.statusKey,
        statusLabel: status.label,
        statusDesc: status.desc,
        statusColor: status.color,
        eta: status.eta,
        depot: info.depot,
        depotName: info.depotName
      });
    });

    const byType = Object.values(byTypeMap);
    // 排序: e → emu → dr
    byType.sort((a, b) => ['e', 'emu', 'dr'].indexOf(a.type) - ['e', 'emu', 'dr'].indexOf(b.type));
    // 車輛按 ID 排序
    byType.forEach(bt => bt.vehicles.sort((a, b) => sortByVehicleId(a.id, b.id)));

    const summary = {
      total: byType.reduce((s, bt) => s + bt.total, 0),
      green: byType.reduce((s, bt) => s + bt.green, 0),
      yellow: byType.reduce((s, bt) => s + bt.yellow, 0),
      red: byType.reduce((s, bt) => s + bt.red, 0),
    };

    return {
      data: { summary, byType },
      meta: { generatedAt: new Date().toISOString() }
    };
  }

  // ══════════════════════════════════════════
  // GET /vehicle-detail
  // ══════════════════════════════════════════
  async getVehicleDetail(assetnum, days = 30) {
    await this._simulate();

    // 找出車輛所屬 depot
    let vehicleDepot = null;
    let depotName = '';
    for (const [dc, dates] of Object.entries(MOCK_ALL_DATA)) {
      for (const dayArr of Object.values(dates)) {
        if (dayArr.some(v => v.id === assetnum)) {
          vehicleDepot = dc;
          depotName = (MOCK_DEPOT_META[dc] || {}).name || dc;
          break;
        }
      }
      if (vehicleDepot) break;
    }

    if (!vehicleDepot) {
      throw new APIError(404, 'asset_not_found', `找不到車輛：${assetnum}`);
    }

    // 收集該車所有運用紀錄
    const records = [];
    for (const [dc, dates] of Object.entries(MOCK_ALL_DATA)) {
      for (const [dateStr, dayArr] of Object.entries(dates)) {
        dayArr.forEach(v => {
          if (v.id === assetnum) {
            records.push({ ...v, date: toISODate(dateStr) });
          }
        });
      }
    }
    records.sort((a, b) => b.date.localeCompare(a.date));

    // 取第一筆的 opCode / ma
    const firstRec = records[0] || {};
    const t = getType(assetnum);
    const status = _mockGetVehicleStatus(assetnum);

    // 生成里程時序（模擬）
    const mileageChart = [];
    const baseDate = new Date('2026-02-24');
    let monthlyKm = 0;
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      // 用 seed 產生確定性里程
      const seed = (extractNumeric(assetnum) * 31 + i * 7) % 100;
      const km = seed > 20 ? Math.round((seed * 3.5 + 50) * 10) / 10 : 0;
      mileageChart.push({ date: dateStr, km });
      monthlyKm += km;
    }

    const operations = records.map(r => ({
      date: r.date,
      opCode: r.opCode,
      trains: r.trains,
      start: r.start,
      end: r.end,
      mileage: r.mileage,
      ctrl: r.ctrl,
      ctrlLabel: getCtrlLabel(r.ctrl)
    }));

    return {
      data: {
        asset: {
          id: assetnum,
          type: t,
          typeLabel: getTypeLabel(t),
          depot: vehicleDepot,
          depotName,
          opCode: firstRec.opCode || '',
          ma: firstRec.ma || '',
          status: status.statusKey,
          statusLabel: status.label
        },
        mileage: {
          monthlyKm: Math.round(monthlyKm),
          yearlyKm: Math.round(monthlyKm * 12),
          dailyAvgKm: Math.round(monthlyKm / days * 10) / 10
        },
        mileageChart,
        operations
      },
      meta: {
        days,
        operationCount: operations.length,
        generatedAt: new Date().toISOString()
      }
    };
  }

  // ══════════════════════════════════════════
  // GET /maint-history
  // ══════════════════════════════════════════
  async getMaintHistory(assetnum, days = 90) {
    await this._simulate();
    const seed = extractNumeric(assetnum);
    const items = [];
    const types = [
      { type: 'PM', typeLabel: '定期保養' },
      { type: 'CM', typeLabel: '車輪檢修' },
      { type: 'PM', typeLabel: '電器檢修' },
      { type: 'EM', typeLabel: '緊急維修' },
    ];
    const statuses = ['COMP', 'INPRG', 'APPR'];
    const statusLabels = { COMP: '已完成', INPRG: '進行中', APPR: '已排程' };
    const descs = ['三級定期保養', '輪對踏面旋修', '主變壓器絕緣測試', '轉向架檢修', '空調系統保養', '煞車系統檢查'];

    const count = 3 + (seed % 4);
    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor((seed * 7 + i * 13) % days);
      const d = new Date('2026-02-24');
      d.setDate(d.getDate() - dayOffset);
      const typeInfo = types[(seed + i) % types.length];
      const st = statuses[i === 0 ? 1 : (i < count - 1 ? 0 : 2)];

      items.push({
        wonum: `WO-${d.toISOString().slice(0, 10).replace(/-/g, '')}-${String(seed + i).padStart(3, '0')}`,
        date: d.toISOString().slice(0, 10),
        type: typeInfo.type,
        typeLabel: typeInfo.typeLabel,
        description: descs[(seed + i) % descs.length],
        status: st,
        statusLabel: statusLabels[st],
        duration: st === 'COMP' ? Math.round((2 + (seed + i) % 8) * 10) / 10 : null
      });
    }

    items.sort((a, b) => b.date.localeCompare(a.date));

    return {
      data: items,
      meta: { total: items.length, days }
    };
  }

  // ══════════════════════════════════════════
  // GET /fault-history
  // ══════════════════════════════════════════
  async getFaultHistory(assetnum, days = 180) {
    await this._simulate();
    const seed = extractNumeric(assetnum);
    const items = [];
    const faultDescs = [
      '主電路接觸器異常', '空調壓縮機異常停機', '車門開關感測器故障',
      '集電弓升降異常', '牽引馬達過熱警報', 'ATP 訊號異常',
      '煞車壓力不足', '車體振動異常', '照明系統故障'
    ];
    const severities = ['high', 'medium', 'low'];
    const sevLabels = { high: '高', medium: '中', low: '低' };
    const faultStatuses = ['INPRG', 'RESOLVED', 'RESOLVED', 'RESOLVED'];
    const faultStatusLabels = { INPRG: '處理中', RESOLVED: '已修復' };

    const count = 2 + (seed % 5);
    for (let i = 0; i < count; i++) {
      const dayOffset = Math.floor((seed * 11 + i * 17) % days);
      const d = new Date('2026-02-24');
      d.setDate(d.getDate() - dayOffset);
      const sev = severities[(seed + i) % 3];
      const st = faultStatuses[i % faultStatuses.length];

      items.push({
        failureCode: `F-${String((seed * 3 + i * 7) % 200).padStart(4, '0')}`,
        date: d.toISOString().slice(0, 10),
        description: faultDescs[(seed + i) % faultDescs.length],
        severity: sev,
        severityLabel: sevLabels[sev],
        status: st,
        statusLabel: faultStatusLabels[st]
      });
    }

    items.sort((a, b) => b.date.localeCompare(a.date));
    const bySeverity = { high: 0, medium: 0, low: 0 };
    items.forEach(it => bySeverity[it.severity]++);

    return {
      data: items,
      meta: { total: items.length, days, bySeverity }
    };
  }

  // ══════════════════════════════════════════
  // GET /vehicle-kpi
  // ══════════════════════════════════════════
  async getVehicleKPI(assetnum, period = 365) {
    await this._simulate();
    const seed = extractNumeric(assetnum);

    // MTBF
    const faultCount = 2 + (seed % 6);
    const mtbfHours = Math.round(200 + (seed * 37) % 600);
    const mtbfBenchmark = 720;
    const mtbfPct = Math.min(Math.round(mtbfHours / mtbfBenchmark * 100), 100);
    const mtbfGrade = mtbfPct >= 80 ? 'green' : (mtbfPct >= 50 ? 'yellow' : 'red');

    // MDBF
    const yearlyKm = Math.round(60000 + (seed * 431) % 60000);
    const mdbf = faultCount > 0 ? Math.round(yearlyKm / faultCount) : 0;
    const mdbfBenchmark = 50000;
    const mdbfPct = Math.min(Math.round(mdbf / mdbfBenchmark * 100), 100);
    const mdbfGrade = mdbfPct >= 75 ? 'green' : (mdbfPct >= 45 ? 'yellow' : 'red');

    // MTTR
    const mttrHours = Math.round((2 + (seed * 13) % 60) * 10) / 100;
    const mttrTarget = 4.0;
    const mttrEfficiency = Math.max(0, Math.round((1 - Math.min(mttrHours, 8) / 8) * 100));
    const mttrGrade = mttrHours <= 4 ? 'green' : (mttrHours <= 6 ? 'yellow' : 'red');

    // Trend
    const trends = ['up', 'down', 'flat'];
    const mtbfTrend = trends[seed % 3];
    const mdbfTrend = trends[(seed + 1) % 3];
    const mttrTrend = trends[(seed + 2) % 3];

    return {
      data: {
        assetnum,
        period,
        calculatedAt: new Date().toISOString(),
        mtbf: {
          value: mtbfHours,
          unit: 'hours',
          benchmark: mtbfBenchmark,
          pct: mtbfPct,
          grade: mtbfGrade,
          trend: mtbfTrend,
          trendPct: 5 + (seed % 15),
          faultCount
        },
        mdbf: {
          value: mdbf,
          displayValue: mdbf >= 1000 ? (mdbf / 1000).toFixed(1) + 'k' : String(mdbf),
          unit: 'km',
          benchmark: mdbfBenchmark,
          pct: mdbfPct,
          grade: mdbfGrade,
          trend: mdbfTrend,
          trendPct: 2 + (seed % 10),
          yearlyKm,
          faultCount
        },
        mttr: {
          value: mttrHours,
          unit: 'hours',
          target: mttrTarget,
          pct: mttrEfficiency,
          grade: mttrGrade,
          trend: mttrTrend,
          trendPct: (seed % 8),
          repairCount: faultCount,
          avgRepairHours: mttrHours
        }
      }
    };
  }

  // ══════════════════════════════════════════
  // POST /dynamic-report
  // ══════════════════════════════════════════
  async submitDynamicReport(payload) {
    await this._simulate();
    if (!payload.assetnum || !payload.statusCode) {
      throw new APIError(422, 'validation_error', '必填欄位不完整');
    }
    const validCodes = ['repair', 'parts', 'transit', 'decommission'];
    if (!validCodes.includes(payload.statusCode)) {
      throw new APIError(422, 'validation_error', '無效的狀態碼');
    }
    return {
      data: {
        wonum: `WO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 999)).padStart(3, '0')}`,
        assetnum: payload.assetnum,
        status: 'APPR',
        createdAt: new Date().toISOString()
      }
    };
  }
}

// ═══════════════════════════════════════════
// Mock 狀態判定（modulo-based deterministic）
// ═══════════════════════════════════════════

const MOCK_STATUS_REASONS = {
  repair:       { statusKey: 'repair',       label: '檢修',   desc: '定期檢修保養中',     color: 'red',    eta: '2026/03/05' },
  parts:        { statusKey: 'parts',        label: '待料',   desc: '等待零件到貨中',     color: 'red',    eta: '2026/03/12' },
  transit:      { statusKey: 'transit',       label: '回送中', desc: '回送至配屬機務段',   color: 'yellow', eta: '2026/02/25' },
  decommission: { statusKey: 'decommission', label: '待報廢', desc: '已排定報廢程序',     color: 'red',    eta: '待定' },
  available:    { statusKey: 'available',     label: '可用',   desc: '正常可營運狀態',     color: 'green',  eta: '—' }
};

function _mockGetVehicleStatus(id) {
  const num = extractNumeric(id);
  if (num % 17 === 0) return { ...MOCK_STATUS_REASONS.decommission };
  if (num % 7 === 0)  return { ...MOCK_STATUS_REASONS.repair };
  if (num % 11 === 0) return { ...MOCK_STATUS_REASONS.parts };
  if (num % 13 === 0) return { ...MOCK_STATUS_REASONS.transit };
  return { ...MOCK_STATUS_REASONS.available };
}

// ═══════════════════════════════════════════
// 集中 Mock 資料
// ═══════════════════════════════════════════

const MOCK_DEPOT_META = {
  MGY00: { name: '七堵機務段', location: '基隆市七堵區', monthly: 936, rate: '98.7%', pending: 3 },
  MTP00: { name: '臺北機務段', location: '臺北市松山區', monthly: 1120, rate: '99.1%', pending: 2 },
  MHC00: { name: '新竹機務段', location: '新竹市東區', monthly: 780, rate: '97.8%', pending: 4 },
  MCH00: { name: '彰化機務段', location: '彰化縣彰化市', monthly: 850, rate: '98.2%', pending: 3 },
  MCY00: { name: '嘉義機務段', location: '嘉義市西區', monthly: 620, rate: '97.5%', pending: 5 },
  MKH00: { name: '高雄機務段', location: '高雄市三民區', monthly: 1050, rate: '98.9%', pending: 2 },
  MHL00: { name: '花蓮機務段', location: '花蓮縣花蓮市', monthly: 580, rate: '96.8%', pending: 6 },
  MTC00: { name: '台中機務段', location: '臺中市南區', monthly: 920, rate: '98.4%', pending: 3 }
};

const MOCK_ALL_DATA = {
  MGY00: {
    '2026/02/24': [
      { id: 'E236', group: 'E236', ctrl: 'A', opCode: '12', days: 0, trains: ['7035'], mileage: 39, depot: 'MGY00', ma: 'CTE12', start: '07:00', end: '08:15', startTrain: '7035', endTrain: '7035' },
      { id: 'E401', group: 'E401', ctrl: 'A', opCode: '12', days: 1, trains: ['7036'], mileage: 36.9, depot: 'MGY00', ma: 'CTE12', start: '06:30', end: '08:00', startTrain: '7036', endTrain: '7036' },
      { id: 'E235', group: 'E235', ctrl: 'A', opCode: '17', days: 0, trains: ['7503A', '7557'], mileage: 45.8, depot: 'MGY00', ma: 'CTE17', start: '08:10', end: '11:30', startTrain: '7503A', endTrain: '7557' },
      { id: 'E234', group: 'E234', ctrl: 'A', opCode: '18', days: 0, trains: ['7538A', '7538'], mileage: 193.7, depot: 'MGY00', ma: 'CTE18', start: '10:13', end: '18:54', startTrain: '7538A', endTrain: '7538' },
      { id: 'E315', group: 'E315', ctrl: 'A', opCode: '18', days: 1, trains: ['7350A', '7350', '7351', '7532', '7353', '7354', '7355', '7356'], mileage: 356.7, depot: 'MGY00', ma: 'CTE18', start: '05:30', end: '21:00', startTrain: '7350A', endTrain: '7356' },
      { id: 'E301', group: 'E301', ctrl: 'A', opCode: '19', days: 2, trains: ['7503S', '7503', '7503B'], mileage: 99, depot: 'MGY00', ma: 'CTE19', start: '07:40', end: '14:20', startTrain: '7503S', endTrain: '7503B' },
      { id: 'E541', group: 'E541', ctrl: 'A', opCode: '51', days: 0, trains: ['1A', '1', '1B', '1N'], mileage: 951.1, depot: 'MGY00', ma: 'CTE51', start: '04:30', end: '22:30', startTrain: '1A', endTrain: '1N' },
      { id: 'E505', group: 'E505', ctrl: 'A', opCode: '52', days: 0, trains: ['2S', '2A', '2', '2B'], mileage: 951, depot: 'MGY00', ma: 'CTE52', start: '04:45', end: '22:15', startTrain: '2S', endTrain: '2B' },
      { id: 'E528', group: 'E528', ctrl: 'A', opCode: 'ER05', days: 0, trains: ['6032'], mileage: 0, depot: 'MGY00', ma: 'CTE02', start: '12:46', end: '21:12', startTrain: '6032', endTrain: '6032' },
      { id: 'E527', group: 'E527', ctrl: 'A', opCode: 'ER02', days: 2, trains: ['6032', '6032'], mileage: 0, depot: 'MGY00', ma: 'CTE02', start: '12:46', end: '21:12', startTrain: '6032', endTrain: '6032' },
      { id: 'EMU3240', group: 'EMU3240', ctrl: 'A', opCode: 'E51', days: 0, trains: ['145'], mileage: 426, depot: 'MGY00', ma: 'CTU51C', start: '17:37', end: '23:40', startTrain: '145', endTrain: '145' },
      { id: 'EMU3250', group: 'EMU3250', ctrl: 'A', opCode: 'E51', days: 1, trains: ['110', '133'], mileage: 847.3, depot: 'MGY00', ma: 'CTU51C', start: '06:22', end: '20:25', startTrain: '110', endTrain: '133' },
      { id: 'EMU3230', group: 'EMU3230', ctrl: 'A', opCode: 'E51', days: 2, trains: ['116'], mileage: 421.3, depot: 'MGY00', ma: 'CTU51C', start: '08:33', end: '14:23', startTrain: '116', endTrain: '116' },
      { id: 'EMU3300', group: 'EMU3300', ctrl: 'A', opCode: 'E61', days: 0, trains: ['117A', '117', '146'], mileage: 859.7, depot: 'MGY00', ma: 'CTU61C', start: '08:56', end: '22:44', startTrain: '117A', endTrain: '146' },
      { id: 'EMU3280', group: 'EMU3280', ctrl: 'A', opCode: 'E61', days: 1, trains: ['111', '132'], mileage: 893.2, depot: 'MGY00', ma: 'CTU61C', start: '07:23', end: '18:45', startTrain: '111', endTrain: '132' },
      { id: 'EMU3310', group: 'EMU3310', ctrl: 'A', opCode: 'E63', days: 0, trains: ['127'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '13:58', end: '16:35', startTrain: '127', endTrain: '127' },
      { id: 'EMU3340', group: 'EMU3340', ctrl: 'A', opCode: 'E63', days: 1, trains: ['148'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '17:40', end: '20:18', startTrain: '148', endTrain: '148' },
      { id: 'EMU3270', group: 'EMU3270', ctrl: 'A', opCode: 'E63', days: 2, trains: ['193', '194'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '09:14', end: '14:53', startTrain: '193', endTrain: '194' },
      { id: 'DR1033', group: 'DR1033', ctrl: 'A', opCode: 'K1ABC', days: 1, trains: ['4715', '4722'], mileage: 62.4, depot: 'MGY00', ma: 'CTK01C', start: '06:04', end: '09:56', startTrain: '4715', endTrain: '4722' },
      { id: 'DR1029', group: 'DR1029', ctrl: 'B', opCode: 'K1ABC', days: 1, trains: ['4715', '4722'], mileage: 62.4, depot: 'MGY00', ma: 'CTK01C', start: '06:04', end: '09:56', startTrain: '4715', endTrain: '4722' },
      { id: 'DR1017', group: 'DR1017', ctrl: 'C', opCode: 'K1ABC', days: 1, trains: ['4715', '4722'], mileage: 62.4, depot: 'MGY00', ma: 'CTK01C', start: '06:04', end: '09:56', startTrain: '4715', endTrain: '4722' },
    ],
    '2026/02/23': [
      { id: 'E401', group: 'E401', ctrl: 'A', opCode: '12', days: 0, trains: ['7035'], mileage: 39, depot: 'MGY00', ma: 'CTE12', start: '07:00', end: '08:15', startTrain: '7035', endTrain: '7035' },
      { id: 'E236', group: 'E236', ctrl: 'A', opCode: '12', days: 1, trains: ['7036'], mileage: 36.9, depot: 'MGY00', ma: 'CTE12', start: '06:30', end: '08:00', startTrain: '7036', endTrain: '7036' },
      { id: 'E235', group: 'E235', ctrl: 'A', opCode: '17', days: 0, trains: ['7503A', '7557'], mileage: 45.8, depot: 'MGY00', ma: 'CTE17', start: '08:10', end: '11:30', startTrain: '7503A', endTrain: '7557' },
      { id: 'E315', group: 'E315', ctrl: 'A', opCode: '18', days: 0, trains: ['7538A', '7538'], mileage: 193.7, depot: 'MGY00', ma: 'CTE18', start: '10:13', end: '18:54', startTrain: '7538A', endTrain: '7538' },
      { id: 'E234', group: 'E234', ctrl: 'A', opCode: '18', days: 1, trains: ['7350A', '7350', '7351', '7359B'], mileage: 356.7, depot: 'MGY00', ma: 'CTE18', start: '05:30', end: '21:00', startTrain: '7350A', endTrain: '7359B' },
      { id: 'E301', group: 'E301', ctrl: 'A', opCode: '19', days: 1, trains: ['7404', '7535'], mileage: 151, depot: 'MGY00', ma: 'CTE19', start: '07:40', end: '14:20', startTrain: '7404', endTrain: '7535' },
      { id: 'E541', group: 'E541', ctrl: 'A', opCode: '51', days: 0, trains: ['1A', '1N'], mileage: 951.1, depot: 'MGY00', ma: 'CTE51', start: '04:30', end: '22:30', startTrain: '1A', endTrain: '1N' },
      { id: 'E505', group: 'E505', ctrl: 'A', opCode: '52', days: 0, trains: ['2S', '2B'], mileage: 951, depot: 'MGY00', ma: 'CTE52', start: '04:45', end: '22:15', startTrain: '2S', endTrain: '2B' },
      { id: 'E527', group: 'E527', ctrl: 'A', opCode: 'ER02', days: 2, trains: ['6032', '6032'], mileage: 0, depot: 'MGY00', ma: 'CTE02', start: '12:46', end: '21:12', startTrain: '6032', endTrain: '6032' },
      { id: 'EMU3250', group: 'EMU3250', ctrl: 'A', opCode: 'E51', days: 0, trains: ['145'], mileage: 426, depot: 'MGY00', ma: 'CTU51C', start: '17:37', end: '23:40', startTrain: '145', endTrain: '145' },
      { id: 'EMU3230', group: 'EMU3230', ctrl: 'A', opCode: 'E51', days: 1, trains: ['110', '133'], mileage: 847.3, depot: 'MGY00', ma: 'CTU51C', start: '06:22', end: '20:25', startTrain: '110', endTrain: '133' },
      { id: 'EMU3240', group: 'EMU3240', ctrl: 'A', opCode: 'E51', days: 2, trains: ['116'], mileage: 421.3, depot: 'MGY00', ma: 'CTU51C', start: '08:33', end: '14:23', startTrain: '116', endTrain: '116' },
      { id: 'EMU3280', group: 'EMU3280', ctrl: 'A', opCode: 'E61', days: 0, trains: ['117A', '146'], mileage: 859.7, depot: 'MGY00', ma: 'CTU61C', start: '08:56', end: '22:44', startTrain: '117A', endTrain: '146' },
      { id: 'EMU3300', group: 'EMU3300', ctrl: 'A', opCode: 'E61', days: 1, trains: ['111', '132'], mileage: 893.2, depot: 'MGY00', ma: 'CTU61C', start: '07:23', end: '18:45', startTrain: '111', endTrain: '132' },
      { id: 'EMU3340', group: 'EMU3340', ctrl: 'A', opCode: 'E63', days: 0, trains: ['127'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '13:58', end: '16:35', startTrain: '127', endTrain: '127' },
      { id: 'EMU3270', group: 'EMU3270', ctrl: 'A', opCode: 'E63', days: 1, trains: ['148'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '17:40', end: '20:18', startTrain: '148', endTrain: '148' },
      { id: 'EMU3310', group: 'EMU3310', ctrl: 'A', opCode: 'E63', days: 2, trains: ['193', '194'], mileage: 0, depot: 'MGY00', ma: 'CTU63C', start: '09:14', end: '14:53', startTrain: '193', endTrain: '194' },
      { id: 'DR1033', group: 'DR1033', ctrl: 'A', opCode: 'K1ABC', days: 0, trains: ['4706', '4714'], mileage: 93.6, depot: 'MGY00', ma: 'CTK01C', start: '06:04', end: '09:56', startTrain: '4706', endTrain: '4714' },
      { id: 'DR1029', group: 'DR1029', ctrl: 'B', opCode: 'K1ABC', days: 0, trains: ['4706', '4714'], mileage: 93.6, depot: 'MGY00', ma: 'CTK01C', start: '06:04', end: '09:56', startTrain: '4706', endTrain: '4714' },
    ]
  },
  MTP00: {
    '2026/02/24': [
      { id: 'E212', group: 'E212', ctrl: 'A', opCode: '11', days: 0, trains: ['1101', '1102'], mileage: 308.2, depot: 'MTP00', ma: 'TPE11', start: '06:15', end: '14:30', startTrain: '1101', endTrain: '1102' },
      { id: 'E213', group: 'E213', ctrl: 'A', opCode: '12', days: 1, trains: ['1103', '1104'], mileage: 156.8, depot: 'MTP00', ma: 'TPE12', start: '07:20', end: '12:40', startTrain: '1103', endTrain: '1104' },
      { id: 'E214', group: 'E214', ctrl: 'A', opCode: '13', days: 0, trains: ['1105', '1106'], mileage: 58.4, depot: 'MTP00', ma: 'TPE13', start: '08:00', end: '10:30', startTrain: '1105', endTrain: '1106' },
      { id: 'E215', group: 'E215', ctrl: 'B', opCode: '13', days: 1, trains: ['1105', '1106'], mileage: 58.4, depot: 'MTP00', ma: 'TPE13', start: '08:00', end: '10:30', startTrain: '1105', endTrain: '1106' },
      { id: 'EMU901', group: 'EMU901', ctrl: 'A', opCode: 'U21', days: 0, trains: ['175', '176'], mileage: 712.6, depot: 'MTP00', ma: 'TPU21', start: '06:50', end: '19:20', startTrain: '175', endTrain: '176' },
      { id: 'EMU902', group: 'EMU902', ctrl: 'A', opCode: 'U22', days: 1, trains: ['281', '282'], mileage: 142.0, depot: 'MTP00', ma: 'TPU22', start: '07:15', end: '11:45', startTrain: '281', endTrain: '282' },
      { id: 'EMU903', group: 'EMU903', ctrl: 'A', opCode: 'U23', days: 0, trains: ['283', '284'], mileage: 68.4, depot: 'MTP00', ma: 'TPU23', start: '09:00', end: '11:20', startTrain: '283', endTrain: '284' },
      { id: 'EMU904', group: 'EMU904', ctrl: 'A', opCode: 'U24', days: 2, trains: ['281', '284'], mileage: 105.2, depot: 'MTP00', ma: 'TPU24', start: '14:00', end: '18:30', startTrain: '281', endTrain: '284' },
    ],
    '2026/02/23': [
      { id: 'E212', group: 'E212', ctrl: 'A', opCode: '11', days: 1, trains: ['1101', '1102'], mileage: 308.2, depot: 'MTP00', ma: 'TPE11', start: '06:15', end: '14:30', startTrain: '1101', endTrain: '1102' },
      { id: 'E213', group: 'E213', ctrl: 'A', opCode: '12', days: 0, trains: ['1103', '1104'], mileage: 156.8, depot: 'MTP00', ma: 'TPE12', start: '07:20', end: '12:40', startTrain: '1103', endTrain: '1104' },
      { id: 'E214', group: 'E214', ctrl: 'A', opCode: '13', days: 0, trains: ['1105', '1106'], mileage: 58.4, depot: 'MTP00', ma: 'TPE13', start: '08:00', end: '10:30', startTrain: '1105', endTrain: '1106' },
      { id: 'EMU901', group: 'EMU901', ctrl: 'A', opCode: 'U21', days: 1, trains: ['175', '176'], mileage: 712.6, depot: 'MTP00', ma: 'TPU21', start: '06:50', end: '19:20', startTrain: '175', endTrain: '176' },
      { id: 'EMU902', group: 'EMU902', ctrl: 'A', opCode: 'U22', days: 0, trains: ['281', '282'], mileage: 142.0, depot: 'MTP00', ma: 'TPU22', start: '07:15', end: '11:45', startTrain: '281', endTrain: '282' },
      { id: 'EMU903', group: 'EMU903', ctrl: 'A', opCode: 'U23', days: 1, trains: ['283', '284'], mileage: 68.4, depot: 'MTP00', ma: 'TPU23', start: '09:00', end: '11:20', startTrain: '283', endTrain: '284' },
    ]
  },
  MHC00: {
    '2026/02/24': [
      { id: 'E218', group: 'E218', ctrl: 'A', opCode: '31', days: 0, trains: ['2201', '2202'], mileage: 48.2, depot: 'MHC00', ma: 'HCE31', start: '06:30', end: '08:45', startTrain: '2201', endTrain: '2202' },
      { id: 'E219', group: 'E219', ctrl: 'A', opCode: '32', days: 1, trains: ['2203', '2204'], mileage: 72.6, depot: 'MHC00', ma: 'HCE32', start: '07:10', end: '10:50', startTrain: '2203', endTrain: '2204' },
      { id: 'EMU601', group: 'EMU601', ctrl: 'A', opCode: 'U31', days: 0, trains: ['561', '562'], mileage: 196.4, depot: 'MHC00', ma: 'HCU31', start: '06:00', end: '12:15', startTrain: '561', endTrain: '562' },
      { id: 'EMU602', group: 'EMU602', ctrl: 'A', opCode: 'U32', days: 1, trains: ['561', '562'], mileage: 196.4, depot: 'MHC00', ma: 'HCU32', start: '13:00', end: '19:15', startTrain: '561', endTrain: '562' },
      { id: 'EMU603', group: 'EMU603', ctrl: 'A', opCode: 'U33', days: 0, trains: ['2201', '2204'], mileage: 120.8, depot: 'MHC00', ma: 'HCU33', start: '09:30', end: '15:40', startTrain: '2201', endTrain: '2204' },
      { id: 'DR2001', group: 'DR2001', ctrl: 'A', opCode: 'K31', days: 0, trains: ['2203', '2204'], mileage: 72.6, depot: 'MHC00', ma: 'HCK31', start: '15:00', end: '18:30', startTrain: '2203', endTrain: '2204' },
      { id: 'DR2002', group: 'DR2002', ctrl: 'B', opCode: 'K31', days: 0, trains: ['2203', '2204'], mileage: 72.6, depot: 'MHC00', ma: 'HCK31', start: '15:00', end: '18:30', startTrain: '2203', endTrain: '2204' },
    ],
    '2026/02/23': [
      { id: 'E218', group: 'E218', ctrl: 'A', opCode: '31', days: 1, trains: ['2201', '2202'], mileage: 48.2, depot: 'MHC00', ma: 'HCE31', start: '06:30', end: '08:45', startTrain: '2201', endTrain: '2202' },
      { id: 'E219', group: 'E219', ctrl: 'A', opCode: '32', days: 0, trains: ['2203', '2204'], mileage: 72.6, depot: 'MHC00', ma: 'HCE32', start: '07:10', end: '10:50', startTrain: '2203', endTrain: '2204' },
      { id: 'EMU601', group: 'EMU601', ctrl: 'A', opCode: 'U31', days: 1, trains: ['561', '562'], mileage: 196.4, depot: 'MHC00', ma: 'HCU31', start: '06:00', end: '12:15', startTrain: '561', endTrain: '562' },
      { id: 'EMU602', group: 'EMU602', ctrl: 'A', opCode: 'U32', days: 0, trains: ['561', '562'], mileage: 196.4, depot: 'MHC00', ma: 'HCU32', start: '13:00', end: '19:15', startTrain: '561', endTrain: '562' },
      { id: 'DR2001', group: 'DR2001', ctrl: 'A', opCode: 'K31', days: 1, trains: ['2203', '2204'], mileage: 72.6, depot: 'MHC00', ma: 'HCK31', start: '15:00', end: '18:30', startTrain: '2203', endTrain: '2204' },
    ]
  },
  MCH00: {
    '2026/02/24': [
      { id: 'E220', group: 'E220', ctrl: 'A', opCode: '41', days: 0, trains: ['3301', '3302'], mileage: 38.4, depot: 'MCH00', ma: 'CHE41', start: '06:00', end: '07:50', startTrain: '3301', endTrain: '3302' },
      { id: 'E221', group: 'E221', ctrl: 'A', opCode: '42', days: 1, trains: ['3303', '3304'], mileage: 55.2, depot: 'MCH00', ma: 'CHE42', start: '07:30', end: '10:20', startTrain: '3303', endTrain: '3304' },
      { id: 'E222', group: 'E222', ctrl: 'A', opCode: '43', days: 0, trains: ['671', '672'], mileage: 34.8, depot: 'MCH00', ma: 'CHE43', start: '11:00', end: '13:10', startTrain: '671', endTrain: '672' },
      { id: 'EMU701', group: 'EMU701', ctrl: 'A', opCode: 'U41', days: 0, trains: ['3301', '3302', '3303', '3304'], mileage: 93.6, depot: 'MCH00', ma: 'CHU41', start: '06:00', end: '14:00', startTrain: '3301', endTrain: '3304' },
      { id: 'EMU702', group: 'EMU702', ctrl: 'A', opCode: 'U42', days: 1, trains: ['671', '672'], mileage: 34.8, depot: 'MCH00', ma: 'CHU42', start: '14:00', end: '16:10', startTrain: '671', endTrain: '672' },
      { id: 'EMU703', group: 'EMU703', ctrl: 'A', opCode: 'U43', days: 2, trains: ['3301', '3304'], mileage: 93.6, depot: 'MCH00', ma: 'CHU43', start: '16:30', end: '21:00', startTrain: '3301', endTrain: '3304' },
      { id: 'DR3001', group: 'DR3001', ctrl: 'A', opCode: 'K41', days: 0, trains: ['3303', '3304'], mileage: 55.2, depot: 'MCH00', ma: 'CHK41', start: '05:40', end: '08:20', startTrain: '3303', endTrain: '3304' },
    ],
    '2026/02/23': [
      { id: 'E220', group: 'E220', ctrl: 'A', opCode: '41', days: 1, trains: ['3301', '3302'], mileage: 38.4, depot: 'MCH00', ma: 'CHE41', start: '06:00', end: '07:50', startTrain: '3301', endTrain: '3302' },
      { id: 'E221', group: 'E221', ctrl: 'A', opCode: '42', days: 0, trains: ['3303', '3304'], mileage: 55.2, depot: 'MCH00', ma: 'CHE42', start: '07:30', end: '10:20', startTrain: '3303', endTrain: '3304' },
      { id: 'EMU701', group: 'EMU701', ctrl: 'A', opCode: 'U41', days: 1, trains: ['3301', '3302', '3303', '3304'], mileage: 93.6, depot: 'MCH00', ma: 'CHU41', start: '06:00', end: '14:00', startTrain: '3301', endTrain: '3304' },
      { id: 'EMU702', group: 'EMU702', ctrl: 'A', opCode: 'U42', days: 0, trains: ['671', '672'], mileage: 34.8, depot: 'MCH00', ma: 'CHU42', start: '14:00', end: '16:10', startTrain: '671', endTrain: '672' },
      { id: 'DR3001', group: 'DR3001', ctrl: 'A', opCode: 'K41', days: 1, trains: ['3303', '3304'], mileage: 55.2, depot: 'MCH00', ma: 'CHK41', start: '05:40', end: '08:20', startTrain: '3303', endTrain: '3304' },
    ]
  },
  MCY00: {
    '2026/02/24': [
      { id: 'E302', group: 'E302', ctrl: 'A', opCode: '51', days: 0, trains: ['4401', '4402'], mileage: 64.8, depot: 'MCY00', ma: 'CYE51', start: '06:20', end: '09:40', startTrain: '4401', endTrain: '4402' },
      { id: 'E303', group: 'E303', ctrl: 'A', opCode: '52', days: 1, trains: ['4403', '4404'], mileage: 48.6, depot: 'MCY00', ma: 'CYE52', start: '08:00', end: '11:15', startTrain: '4403', endTrain: '4404' },
      { id: 'EMU801', group: 'EMU801', ctrl: 'A', opCode: 'U51', days: 0, trains: ['4401', '4402', '4403', '4404'], mileage: 113.4, depot: 'MCY00', ma: 'CYU51', start: '06:20', end: '15:00', startTrain: '4401', endTrain: '4404' },
      { id: 'EMU802', group: 'EMU802', ctrl: 'A', opCode: 'U52', days: 1, trains: ['4401', '4404'], mileage: 113.4, depot: 'MCY00', ma: 'CYU52', start: '15:30', end: '21:00', startTrain: '4401', endTrain: '4404' },
      { id: 'DR4001', group: 'DR4001', ctrl: 'A', opCode: 'K51', days: 0, trains: ['4403', '4404'], mileage: 48.6, depot: 'MCY00', ma: 'CYK51', start: '14:00', end: '17:15', startTrain: '4403', endTrain: '4404' },
      { id: 'DR4002', group: 'DR4002', ctrl: 'B', opCode: 'K51', days: 0, trains: ['4403', '4404'], mileage: 48.6, depot: 'MCY00', ma: 'CYK51', start: '14:00', end: '17:15', startTrain: '4403', endTrain: '4404' },
    ],
    '2026/02/23': [
      { id: 'E302', group: 'E302', ctrl: 'A', opCode: '51', days: 1, trains: ['4401', '4402'], mileage: 64.8, depot: 'MCY00', ma: 'CYE51', start: '06:20', end: '09:40', startTrain: '4401', endTrain: '4402' },
      { id: 'EMU801', group: 'EMU801', ctrl: 'A', opCode: 'U51', days: 1, trains: ['4401', '4402', '4403', '4404'], mileage: 113.4, depot: 'MCY00', ma: 'CYU51', start: '06:20', end: '15:00', startTrain: '4401', endTrain: '4404' },
      { id: 'DR4001', group: 'DR4001', ctrl: 'A', opCode: 'K51', days: 1, trains: ['4403', '4404'], mileage: 48.6, depot: 'MCY00', ma: 'CYK51', start: '14:00', end: '17:15', startTrain: '4403', endTrain: '4404' },
    ]
  },
  MKH00: {
    '2026/02/24': [
      { id: 'E310', group: 'E310', ctrl: 'A', opCode: '61', days: 0, trains: ['5501', '5502'], mileage: 61.2, depot: 'MKH00', ma: 'KHE61', start: '05:50', end: '08:30', startTrain: '5501', endTrain: '5502' },
      { id: 'E311', group: 'E311', ctrl: 'A', opCode: '62', days: 1, trains: ['5503', '5504'], mileage: 89.4, depot: 'MKH00', ma: 'KHE62', start: '06:30', end: '10:40', startTrain: '5503', endTrain: '5504' },
      { id: 'E312', group: 'E312', ctrl: 'A', opCode: '63', days: 0, trains: ['5505', '5506'], mileage: 72.8, depot: 'MKH00', ma: 'KHE63', start: '09:00', end: '12:30', startTrain: '5505', endTrain: '5506' },
      { id: 'EMU3101', group: 'EMU3101', ctrl: 'A', opCode: 'U61', days: 0, trains: ['371', '372'], mileage: 356.8, depot: 'MKH00', ma: 'KHU61', start: '06:00', end: '16:30', startTrain: '371', endTrain: '372' },
      { id: 'EMU3102', group: 'EMU3102', ctrl: 'A', opCode: 'U62', days: 1, trains: ['5501', '5502', '5503', '5504'], mileage: 150.6, depot: 'MKH00', ma: 'KHU62', start: '07:00', end: '15:00', startTrain: '5501', endTrain: '5504' },
      { id: 'EMU3103', group: 'EMU3103', ctrl: 'A', opCode: 'U63', days: 0, trains: ['5505', '5506'], mileage: 72.8, depot: 'MKH00', ma: 'KHU63', start: '13:00', end: '16:30', startTrain: '5505', endTrain: '5506' },
      { id: 'EMU3104', group: 'EMU3104', ctrl: 'A', opCode: 'U64', days: 2, trains: ['371'], mileage: 178.4, depot: 'MKH00', ma: 'KHU64', start: '16:00', end: '22:30', startTrain: '371', endTrain: '371' },
    ],
    '2026/02/23': [
      { id: 'E310', group: 'E310', ctrl: 'A', opCode: '61', days: 1, trains: ['5501', '5502'], mileage: 61.2, depot: 'MKH00', ma: 'KHE61', start: '05:50', end: '08:30', startTrain: '5501', endTrain: '5502' },
      { id: 'E311', group: 'E311', ctrl: 'A', opCode: '62', days: 0, trains: ['5503', '5504'], mileage: 89.4, depot: 'MKH00', ma: 'KHE62', start: '06:30', end: '10:40', startTrain: '5503', endTrain: '5504' },
      { id: 'EMU3101', group: 'EMU3101', ctrl: 'A', opCode: 'U61', days: 1, trains: ['371', '372'], mileage: 356.8, depot: 'MKH00', ma: 'KHU61', start: '06:00', end: '16:30', startTrain: '371', endTrain: '372' },
      { id: 'EMU3102', group: 'EMU3102', ctrl: 'A', opCode: 'U62', days: 0, trains: ['5501', '5502', '5503', '5504'], mileage: 150.6, depot: 'MKH00', ma: 'KHU62', start: '07:00', end: '15:00', startTrain: '5501', endTrain: '5504' },
      { id: 'EMU3103', group: 'EMU3103', ctrl: 'A', opCode: 'U63', days: 1, trains: ['5505', '5506'], mileage: 72.8, depot: 'MKH00', ma: 'KHU63', start: '13:00', end: '16:30', startTrain: '5505', endTrain: '5506' },
    ]
  },
  MHL00: {
    '2026/02/24': [
      { id: 'E320', group: 'E320', ctrl: 'A', opCode: '71', days: 0, trains: ['6601', '6602'], mileage: 301.4, depot: 'MHL00', ma: 'HLE71', start: '06:00', end: '15:30', startTrain: '6601', endTrain: '6602' },
      { id: 'E321', group: 'E321', ctrl: 'A', opCode: '72', days: 1, trains: ['6603', '6604'], mileage: 168.2, depot: 'MHL00', ma: 'HLE72', start: '07:30', end: '13:40', startTrain: '6603', endTrain: '6604' },
      { id: 'EMU3201', group: 'EMU3201', ctrl: 'A', opCode: 'U71', days: 0, trains: ['6601', '6602', '6603', '6604'], mileage: 469.6, depot: 'MHL00', ma: 'HLU71', start: '06:00', end: '19:00', startTrain: '6601', endTrain: '6604' },
      { id: 'DR5001', group: 'DR5001', ctrl: 'A', opCode: 'K71', days: 0, trains: ['6605', '6606'], mileage: 38.4, depot: 'MHL00', ma: 'HLK71', start: '08:00', end: '10:20', startTrain: '6605', endTrain: '6606' },
      { id: 'DR5002', group: 'DR5002', ctrl: 'A', opCode: 'K72', days: 1, trains: ['6603', '6604'], mileage: 168.2, depot: 'MHL00', ma: 'HLK72', start: '14:00', end: '20:10', startTrain: '6603', endTrain: '6604' },
      { id: 'DR5003', group: 'DR5003', ctrl: 'B', opCode: 'K72', days: 1, trains: ['6603', '6604'], mileage: 168.2, depot: 'MHL00', ma: 'HLK72', start: '14:00', end: '20:10', startTrain: '6603', endTrain: '6604' },
    ],
    '2026/02/23': [
      { id: 'E320', group: 'E320', ctrl: 'A', opCode: '71', days: 1, trains: ['6601', '6602'], mileage: 301.4, depot: 'MHL00', ma: 'HLE71', start: '06:00', end: '15:30', startTrain: '6601', endTrain: '6602' },
      { id: 'EMU3201', group: 'EMU3201', ctrl: 'A', opCode: 'U71', days: 1, trains: ['6601', '6602', '6603', '6604'], mileage: 469.6, depot: 'MHL00', ma: 'HLU71', start: '06:00', end: '19:00', startTrain: '6601', endTrain: '6604' },
      { id: 'DR5001', group: 'DR5001', ctrl: 'A', opCode: 'K71', days: 1, trains: ['6605', '6606'], mileage: 38.4, depot: 'MHL00', ma: 'HLK71', start: '08:00', end: '10:20', startTrain: '6605', endTrain: '6606' },
      { id: 'DR5002', group: 'DR5002', ctrl: 'A', opCode: 'K72', days: 0, trains: ['6603', '6604'], mileage: 168.2, depot: 'MHL00', ma: 'HLK72', start: '14:00', end: '20:10', startTrain: '6603', endTrain: '6604' },
    ]
  },
  MTC00: {
    '2026/02/24': [
      { id: 'E330', group: 'E330', ctrl: 'A', opCode: '81', days: 0, trains: ['7701', '7702'], mileage: 34.8, depot: 'MTC00', ma: 'TCE81', start: '06:10', end: '08:00', startTrain: '7701', endTrain: '7702' },
      { id: 'E331', group: 'E331', ctrl: 'A', opCode: '82', days: 1, trains: ['7703', '7704'], mileage: 40.6, depot: 'MTC00', ma: 'TCE82', start: '07:00', end: '09:10', startTrain: '7703', endTrain: '7704' },
      { id: 'E332', group: 'E332', ctrl: 'A', opCode: '83', days: 0, trains: ['7705', '7706'], mileage: 163.2, depot: 'MTC00', ma: 'TCE83', start: '08:30', end: '14:50', startTrain: '7705', endTrain: '7706' },
      { id: 'EMU1101', group: 'EMU1101', ctrl: 'A', opCode: 'U81', days: 0, trains: ['7701', '7702', '7703', '7704'], mileage: 75.4, depot: 'MTC00', ma: 'TCU81', start: '06:10', end: '12:30', startTrain: '7701', endTrain: '7704' },
      { id: 'EMU1102', group: 'EMU1102', ctrl: 'A', opCode: 'U82', days: 1, trains: ['7705', '7706'], mileage: 163.2, depot: 'MTC00', ma: 'TCU82', start: '14:00', end: '20:20', startTrain: '7705', endTrain: '7706' },
      { id: 'EMU1103', group: 'EMU1103', ctrl: 'A', opCode: 'U83', days: 2, trains: ['7701', '7706'], mileage: 198.0, depot: 'MTC00', ma: 'TCU83', start: '05:30', end: '18:00', startTrain: '7701', endTrain: '7706' },
    ],
    '2026/02/23': [
      { id: 'E330', group: 'E330', ctrl: 'A', opCode: '81', days: 1, trains: ['7701', '7702'], mileage: 34.8, depot: 'MTC00', ma: 'TCE81', start: '06:10', end: '08:00', startTrain: '7701', endTrain: '7702' },
      { id: 'E331', group: 'E331', ctrl: 'A', opCode: '82', days: 0, trains: ['7703', '7704'], mileage: 40.6, depot: 'MTC00', ma: 'TCE82', start: '07:00', end: '09:10', startTrain: '7703', endTrain: '7704' },
      { id: 'EMU1101', group: 'EMU1101', ctrl: 'A', opCode: 'U81', days: 1, trains: ['7701', '7702', '7703', '7704'], mileage: 75.4, depot: 'MTC00', ma: 'TCU81', start: '06:10', end: '12:30', startTrain: '7701', endTrain: '7704' },
      { id: 'EMU1102', group: 'EMU1102', ctrl: 'A', opCode: 'U82', days: 0, trains: ['7705', '7706'], mileage: 163.2, depot: 'MTC00', ma: 'TCU82', start: '14:00', end: '20:20', startTrain: '7705', endTrain: '7706' },
    ]
  }
};
