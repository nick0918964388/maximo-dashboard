# 台鐵車輛運用儀表板 — API 架構設計

> **資料來源**: IBM Maximo (Automation Script JSON API)
> **前端頁面**: index.html / vehicle-status.html / vehicle-history.html
> **版本**: v1.0 | 2026-02-24

---

## 1. 架構總覽

### 1.1 部署拓撲

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────────────┐
│   Browser    │────▶│  Reverse Proxy   │────▶│     IBM Maximo Server       │
│  Dashboard   │◀────│  (Nginx/Apache)  │◀────│                             │
│              │     │                  │     │  ┌───────────────────────┐  │
│  index.html  │     │  /api/v1/*       │     │  │   Automation Scripts  │  │
│  vehicle-    │     │    ↓ proxy to    │     │  │                       │  │
│  status.html │     │  /maximo/oslc/   │     │  │  VDASH_FLEET_SUMMARY  │  │
│  vehicle-    │     │  script/*        │     │  │  VDASH_DAILY_OPS      │  │
│  history.html│     │                  │     │  │  VDASH_VEHICLE_STATUS │  │
│              │     │  + CORS headers  │     │  │  VDASH_VEHICLE_DETAIL │  │
│              │     │  + API Key inject│     │  │  VDASH_MAINT_HISTORY  │  │
│              │     │  + Response cache│     │  │  VDASH_FAULT_HISTORY  │  │
└─────────────┘     └──────────────────┘     │  │  VDASH_VEHICLE_KPI    │  │
                                              │  │  VDASH_DEPOTS         │  │
                                              │  └───────────────────────┘  │
                                              │                             │
                                              │  MBO: ASSET, WORKORDER,     │
                                              │  FAILUREREPORT, METERREADING│
                                              │  LOCATIONS, PM              │
                                              └─────────────────────────────┘
```

### 1.2 為什麼選擇 Autoscript 而非 OSLC 標準端點？

| 考量因素 | OSLC 標準 API | Autoscript 自訂 API |
|---------|--------------|-------------------|
| 資料聚合 | 需多次呼叫再前端整合 | **伺服端一次聚合完成** |
| 回應格式 | 固定 OSLC schema | **可自訂 Dashboard-ready JSON** |
| KPI 計算 | 無法在 API 層計算 | **Jython 腳本直接計算 MTBF/MDBF/MTTR** |
| 跨 MBO 關聯 | 需 N+1 查詢 | **一個腳本 JOIN 多個 MBO** |
| 效能 | 通用查詢，難最佳化 | **針對儀表板場景最佳化查詢** |

**結論**：Autoscript 作為 BFF (Backend-for-Frontend) 層，回傳前端可直接使用的 JSON。

---

## 2. 認證機制

### 2.1 API Key 認證（建議）

```http
GET /api/v1/fleet-summary?depot=MGY00
Header: apikey: {MAXIMO_API_KEY}
```

### 2.2 前端配置

```javascript
// config.js
const API_CONFIG = {
  baseUrl: '/api/v1',                    // Proxy 路徑
  // 若同域直連 Maximo：
  // baseUrl: '/maximo/oslc/script',
  timeout: 15000,
  headers: {
    'apikey': '{{INJECTED_BY_PROXY}}',   // Proxy 注入，前端不持有
    'Accept': 'application/json'
  }
};
```

### 2.3 Nginx Reverse Proxy 配置範例

```nginx
upstream maximo_backend {
    server maximo-host:9080;
}

location /api/v1/ {
    # 移除 /api/v1 前綴，轉發到 Maximo script 路徑
    rewrite ^/api/v1/(.*)$ /maximo/oslc/script/VDASH_$1 break;

    proxy_pass         http://maximo_backend;
    proxy_set_header   apikey "your-maximo-api-key";
    proxy_set_header   Host $host;

    # CORS
    add_header Access-Control-Allow-Origin  $http_origin;
    add_header Access-Control-Allow-Methods "GET, OPTIONS";
    add_header Access-Control-Allow-Headers "Content-Type, apikey";

    # Cache (靜態數據如 depot list)
    proxy_cache_valid 200 5m;
}
```

---

## 3. API 端點設計

### 3.0 端點總覽

```
Page: index.html (主儀表板)
├── GET /api/v1/fleet-summary     → VDASH_FLEET_SUMMARY
├── GET /api/v1/daily-ops         → VDASH_DAILY_OPS
└── GET /api/v1/depots            → VDASH_DEPOTS

Page: vehicle-status.html (狀態總覽)
└── GET /api/v1/vehicle-status    → VDASH_VEHICLE_STATUS

Page: vehicle-history.html (車輛歷程)
├── GET /api/v1/vehicle-detail    → VDASH_VEHICLE_DETAIL
├── GET /api/v1/maint-history     → VDASH_MAINT_HISTORY
├── GET /api/v1/fault-history     → VDASH_FAULT_HISTORY
└── GET /api/v1/vehicle-kpi       → VDASH_VEHICLE_KPI

Cross-cutting:
└── POST /api/v1/dynamic-report   → VDASH_DYNAMIC_REPORT
```

---

### 3.1 GET `/api/v1/depots` — 機務段清單

**Autoscript**: `VDASH_DEPOTS`
**Maximo MBO**: `LOCATIONS`
**頁面用途**: index.html 機務段下拉選單

#### Request

```http
GET /api/v1/depots
```

無參數。可快取（depot 資料變動頻率低）。

#### Response `200 OK`

```json
{
  "data": [
    {
      "code": "MGY00",
      "name": "七堵機務段",
      "location": "基隆市七堵區",
      "vehicleCount": 18,
      "availabilityRate": 98.7,
      "pendingMaintenance": 5
    },
    {
      "code": "MTP00",
      "name": "臺北機務段",
      "location": "臺北市松山區",
      "vehicleCount": 22,
      "availabilityRate": 96.2,
      "pendingMaintenance": 3
    }
  ],
  "meta": {
    "total": 8,
    "cached": true,
    "generatedAt": "2026-02-24T08:00:00+08:00"
  }
}
```

#### Maximo Autoscript 邏輯

```python
# VDASH_DEPOTS.py (Jython)
from psdi.server import MXServer
from com.ibm.json.java import JSONObject, JSONArray

locSet = MXServer.getMXServer().getMboSet("LOCATIONS", userInfo)
locSet.setWhere("type = 'DEPOT' and status = 'OPERATING' and siteid = 'TRA'")
locSet.setOrderBy("location")
locSet.reset()

depots = JSONArray()
loc = locSet.moveFirst()
while loc is not None:
    depot = JSONObject()
    depot.put("code", loc.getString("LOCATION"))
    depot.put("name", loc.getString("DESCRIPTION"))
    depot.put("location", loc.getString("STREETADDRESS"))

    # 子查詢：該段車輛數
    assetSet = loc.getMboSet("ASSET")
    depot.put("vehicleCount", assetSet.count())

    depots.add(depot)
    loc = locSet.moveNext()

responseBody = JSONObject()
responseBody.put("data", depots)
```

#### 快取策略

```
Cache-Control: public, max-age=300    # 5 分鐘
ETag: "depot-v{hash}"
```

---

### 3.2 GET `/api/v1/fleet-summary` — 艦隊摘要

**Autoscript**: `VDASH_FLEET_SUMMARY`
**Maximo MBO**: `ASSET` + `METERREADING`
**頁面用途**: index.html 頂部統計卡片 + 車型圓餅圖

#### Request

```http
GET /api/v1/fleet-summary?depot=MGY00&date=2026-02-24
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `depot` | string | Y | 機務段代碼 |
| `date` | YYYY-MM-DD | N | 統計日期（預設今日） |

#### Response `200 OK`

```json
{
  "data": {
    "depot": {
      "code": "MGY00",
      "name": "七堵機務段"
    },
    "date": "2026-02-24",
    "summary": {
      "totalVehicles": 18,
      "activeVehicles": 15,
      "totalMileage": 4856.3,
      "avgMileagePerVehicle": 323.8
    },
    "byType": [
      {
        "type": "e",
        "typeLabel": "電力機車",
        "count": 8,
        "active": 7,
        "totalMileage": 2150.4,
        "avgMileage": 307.2
      },
      {
        "type": "emu",
        "typeLabel": "電聯車",
        "count": 7,
        "active": 6,
        "totalMileage": 2105.1,
        "avgMileage": 350.9
      },
      {
        "type": "dr",
        "typeLabel": "柴油客車",
        "count": 3,
        "active": 2,
        "totalMileage": 600.8,
        "avgMileage": 300.4
      }
    ]
  }
}
```

#### Maximo 查詢邏輯

```sql
-- 該段全車輛
SELECT assetnum, assettype, status
FROM asset
WHERE location = :depot AND siteid = 'TRA';

-- 當日里程合計
SELECT a.assetnum, m.reading
FROM asset a
JOIN meterreading m ON m.assetnum = a.assetnum
WHERE a.location = :depot
  AND m.metername = 'KM_DAILY'
  AND m.readingdate = :date;
```

---

### 3.3 GET `/api/v1/daily-ops` — 當日運用明細

**Autoscript**: `VDASH_DAILY_OPS`
**Maximo MBO**: `WORKORDER` + `ASSET` + `METERREADING`
**頁面用途**: index.html 車輛運用卡片 + 甘特圖

#### Request

```http
GET /api/v1/daily-ops?depot=MGY00&date=2026-02-24&type=all
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `depot` | string | Y | 機務段代碼 |
| `date` | YYYY-MM-DD | N | 運用日期（預設今日） |
| `type` | enum | N | `all` / `e` / `emu` / `dr`（預設 `all`）|

#### Response `200 OK`

```json
{
  "data": {
    "date": "2026-02-24",
    "depot": "MGY00",
    "vehicles": [
      {
        "id": "E315",
        "type": "e",
        "typeLabel": "電力機車",
        "ctrl": "A",
        "ctrlLabel": "主控",
        "opCode": "18",
        "ma": "CTE18",
        "trains": ["7350A", "7350", "7351", "7532", "7353", "7354", "7355", "7356"],
        "start": "05:30",
        "end": "21:00",
        "mileage": 356.7,
        "status": "operating"
      },
      {
        "id": "E316",
        "type": "e",
        "typeLabel": "電力機車",
        "ctrl": "B",
        "ctrlLabel": "被控",
        "opCode": "18",
        "ma": "CTE18",
        "trains": ["7350A", "7350", "7351"],
        "start": "05:30",
        "end": "21:00",
        "mileage": 356.7,
        "status": "operating"
      }
    ]
  },
  "meta": {
    "total": 18,
    "filtered": 18,
    "generatedAt": "2026-02-24T08:15:00+08:00"
  }
}
```

#### Maximo 查詢邏輯

```sql
-- 當日排定的運用工單
SELECT
    w.wonum,
    w.assetnum,
    w.schedstart,
    w.schedfinish,
    w.description,         -- 包含車次編組
    a.assettype,
    a.location,
    m.reading AS mileage
FROM workorder w
JOIN asset a ON a.assetnum = w.assetnum AND a.siteid = w.siteid
LEFT JOIN meterreading m
    ON m.assetnum = w.assetnum
    AND m.metername = 'KM_DAILY'
    AND m.readingdate = DATE(:date)
WHERE a.location = :depot
  AND w.worktype = 'OPS'         -- 運用工單
  AND DATE(w.schedstart) = :date
  AND w.status IN ('APPR', 'INPRG', 'COMP')
ORDER BY a.assettype, a.assetnum;
```

#### 自訂屬性映射

| 前端欄位 | Maximo 來源 | 說明 |
|---------|-----------|------|
| `ctrl` | `WORKORDER.TRA_CTRLMODE` | 自訂欄位：A/B/C 控制模式 |
| `opCode` | `WORKORDER.TRA_OPCODE` | 自訂欄位：運用號碼 |
| `ma` | `WORKORDER.TRA_MACODE` | 自訂欄位：機務指派代碼 |
| `trains` | `WORKORDER.TRA_TRAINSET` | 自訂欄位：列車編組（JSON array 或逗號分隔） |

> **注意**：`ctrl`, `opCode`, `ma`, `trains` 非 Maximo 標準欄位，需在 WORKORDER 上新增自訂屬性（TRA_ 前綴）。

---

### 3.4 GET `/api/v1/vehicle-status` — 全車狀態總覽

**Autoscript**: `VDASH_VEHICLE_STATUS`
**Maximo MBO**: `ASSET` + `WORKORDER` (active)
**頁面用途**: vehicle-status.html 交通燈看板

#### Request

```http
GET /api/v1/vehicle-status?type=all&depot=all
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `type` | enum | N | `all` / `e` / `emu` / `dr` |
| `depot` | string | N | `all` 或指定段代碼 |

#### Response `200 OK`

```json
{
  "data": {
    "summary": {
      "total": 92,
      "green": 65,
      "yellow": 8,
      "red": 19
    },
    "byType": [
      {
        "type": "e",
        "typeLabel": "電力機車",
        "total": 32,
        "green": 24,
        "yellow": 3,
        "red": 5,
        "vehicles": [
          {
            "id": "E301",
            "status": "available",
            "statusLabel": "可用",
            "statusColor": "green",
            "depot": "MGY00",
            "depotName": "七堵機務段"
          },
          {
            "id": "E315",
            "status": "repair",
            "statusLabel": "檢修",
            "statusDesc": "定期檢修保養中",
            "statusColor": "red",
            "eta": "2026-03-05",
            "depot": "MGY00",
            "depotName": "七堵機務段",
            "wonum": "WO-20260220-001"
          }
        ]
      },
      {
        "type": "emu",
        "typeLabel": "電聯車",
        "total": 45,
        "green": 33,
        "yellow": 4,
        "red": 8,
        "vehicles": []
      },
      {
        "type": "dr",
        "typeLabel": "柴油客車",
        "total": 15,
        "green": 8,
        "yellow": 1,
        "red": 6,
        "vehicles": []
      }
    ]
  },
  "meta": {
    "generatedAt": "2026-02-24T08:00:00+08:00"
  }
}
```

#### 狀態對應邏輯（Maximo → 儀表板）

```python
# Autoscript 狀態映射
STATUS_MAP = {
    # Maximo ASSET.STATUS → Dashboard status
    'OPERATING':    {'status': 'available',     'color': 'green',  'label': '可用'},
    'ACTIVE':       {'status': 'available',     'color': 'green',  'label': '可用'},
    'NOT READY':    {'status': 'repair',        'color': 'red',    'label': '檢修'},
    'BROKEN':       {'status': 'repair',        'color': 'red',    'label': '檢修'},
    'MISSING PARTS':{'status': 'parts',         'color': 'red',    'label': '待料'},
    'IN TRANSIT':   {'status': 'transit',        'color': 'yellow', 'label': '回送中'},
    'DECOMMISSIONED':{'status': 'decommission', 'color': 'red',    'label': '待報廢'},
}

# 若有進行中的維修工單，取 ETA
def get_eta(asset):
    woSet = asset.getMboSet("$activeWO", "WORKORDER",
        "assetnum = :assetnum and status in ('APPR','INPRG','WMATL')")
    wo = woSet.moveFirst()
    if wo:
        return wo.getDate("SCHEDFINISH")
    return None
```

---

### 3.5 GET `/api/v1/vehicle-detail` — 車輛基本資料 + 運用紀錄

**Autoscript**: `VDASH_VEHICLE_DETAIL`
**Maximo MBO**: `ASSET` + `WORKORDER` + `METERREADING`
**頁面用途**: vehicle-history.html 上半部（基本資料 + 里程 + 運用紀錄表格）

#### Request

```http
GET /api/v1/vehicle-detail?assetnum=E315&days=30
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `assetnum` | string | Y | 車輛編號 |
| `days` | number | N | 回溯天數：`7` / `14` / `30` / `90`（預設 `30`）|

#### Response `200 OK`

```json
{
  "data": {
    "asset": {
      "id": "E315",
      "type": "e",
      "typeLabel": "電力機車",
      "depot": "MGY00",
      "depotName": "七堵機務段",
      "opCode": "18",
      "ma": "CTE18",
      "status": "repair",
      "statusLabel": "檢修"
    },
    "mileage": {
      "monthlyKm": 8256,
      "yearlyKm": 99100,
      "dailyAvgKm": 275.2
    },
    "mileageChart": [
      { "date": "2026-01-28", "km": 356.7 },
      { "date": "2026-01-29", "km": 289.3 },
      { "date": "2026-01-30", "km": 0 },
      { "date": "2026-02-24", "km": 356.7 }
    ],
    "operations": [
      {
        "date": "2026-02-24",
        "opCode": "18",
        "trains": ["7350A", "7350", "7351", "7532", "7353", "7354", "7355", "7356"],
        "start": "05:30",
        "end": "21:00",
        "mileage": 356.7,
        "ctrl": "A",
        "ctrlLabel": "主控"
      },
      {
        "date": "2026-02-23",
        "opCode": "18",
        "trains": ["7538A", "7538"],
        "start": "10:13",
        "end": "18:54",
        "mileage": 193.7,
        "ctrl": "A",
        "ctrlLabel": "主控"
      }
    ]
  },
  "meta": {
    "days": 30,
    "operationCount": 2,
    "generatedAt": "2026-02-24T08:00:00+08:00"
  }
}
```

#### Maximo 查詢邏輯

```sql
-- 車輛基本資料
SELECT a.assetnum, a.assettype, a.status, a.location,
       l.description AS depotName
FROM asset a
JOIN locations l ON l.location = a.location
WHERE a.assetnum = :assetnum AND a.siteid = 'TRA';

-- 近 N 天運用紀錄
SELECT w.schedstart, w.schedfinish, w.description,
       w.tra_opcode, w.tra_ctrlmode, w.tra_trainset
FROM workorder w
WHERE w.assetnum = :assetnum
  AND w.worktype = 'OPS'
  AND w.schedstart >= CURRENT_DATE - :days DAYS
ORDER BY w.schedstart DESC;

-- 里程時序（Chart.js 用）
SELECT m.readingdate, m.reading
FROM meterreading m
WHERE m.assetnum = :assetnum
  AND m.metername = 'KM_DAILY'
  AND m.readingdate >= CURRENT_DATE - :days DAYS
ORDER BY m.readingdate ASC;
```

---

### 3.6 GET `/api/v1/maint-history` — 保養維修紀錄

**Autoscript**: `VDASH_MAINT_HISTORY`
**Maximo MBO**: `WORKORDER` (worktype IN PM, CM)
**頁面用途**: vehicle-history.html 近期保養紀錄表

#### Request

```http
GET /api/v1/maint-history?assetnum=E315&days=90
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `assetnum` | string | Y | 車輛編號 |
| `days` | number | N | 回溯天數（預設 `90`） |

#### Response `200 OK`

```json
{
  "data": [
    {
      "wonum": "WO-20260220-015",
      "date": "2026-02-20",
      "type": "PM",
      "typeLabel": "定期保養",
      "description": "三級定期保養",
      "status": "COMP",
      "statusLabel": "已完成",
      "duration": 4.5
    },
    {
      "wonum": "WO-20260215-008",
      "date": "2026-02-15",
      "type": "CM",
      "typeLabel": "車輪檢修",
      "description": "輪對踏面旋修",
      "status": "COMP",
      "statusLabel": "已完成",
      "duration": 6.2
    },
    {
      "wonum": "WO-20260228-003",
      "date": "2026-02-28",
      "type": "PM",
      "typeLabel": "電器檢修",
      "description": "主變壓器絕緣測試",
      "status": "APPR",
      "statusLabel": "已排程",
      "duration": null
    }
  ],
  "meta": {
    "total": 6,
    "days": 90
  }
}
```

#### Maximo 查詢

```sql
SELECT w.wonum, w.schedstart, w.worktype, w.description,
       w.status, w.actlabhrs AS duration,
       wt.wtypedesc AS typeLabel
FROM workorder w
JOIN worktype wt ON wt.worktype = w.worktype
WHERE w.assetnum = :assetnum
  AND w.worktype IN ('PM', 'CM', 'EM')   -- PM=定期, CM=矯正, EM=緊急
  AND w.schedstart >= CURRENT_DATE - :days DAYS
ORDER BY w.schedstart DESC;
```

#### 工單狀態映射

| Maximo STATUS | 儀表板顯示 | CSS Class |
|--------------|----------|-----------|
| `COMP` | 已完成 | `status-done` |
| `INPRG` | 進行中 | `status-progress` |
| `APPR` | 已排程 | `status-scheduled` |
| `WMATL` | 待料 | `status-waiting` |
| `CLOSE` | 已結案 | `status-done` |

---

### 3.7 GET `/api/v1/fault-history` — 故障紀錄

**Autoscript**: `VDASH_FAULT_HISTORY`
**Maximo MBO**: `FAILUREREPORT` + `FAILURECODE`
**頁面用途**: vehicle-history.html 近期故障紀錄表

#### Request

```http
GET /api/v1/fault-history?assetnum=E315&days=180
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `assetnum` | string | Y | 車輛編號 |
| `days` | number | N | 回溯天數（預設 `180`） |

#### Response `200 OK`

```json
{
  "data": [
    {
      "failureCode": "F-0143",
      "date": "2026-02-22",
      "description": "主電路接觸器異常",
      "severity": "high",
      "severityLabel": "高",
      "status": "INPRG",
      "statusLabel": "處理中"
    },
    {
      "failureCode": "F-0127",
      "date": "2026-02-18",
      "description": "空調壓縮機異常停機",
      "severity": "medium",
      "severityLabel": "中",
      "status": "RESOLVED",
      "statusLabel": "已修復"
    },
    {
      "failureCode": "F-0098",
      "date": "2026-02-12",
      "description": "車門開關感測器故障",
      "severity": "low",
      "severityLabel": "低",
      "status": "RESOLVED",
      "statusLabel": "已修復"
    },
    {
      "failureCode": "F-0085",
      "date": "2026-01-30",
      "description": "集電弓升降異常",
      "severity": "high",
      "severityLabel": "高",
      "status": "RESOLVED",
      "statusLabel": "已修復"
    }
  ],
  "meta": {
    "total": 4,
    "days": 180,
    "bySeverity": { "high": 2, "medium": 1, "low": 1 }
  }
}
```

#### Maximo 查詢

```sql
SELECT fr.failurecode, fr.reportdate, fr.description,
       fr.tra_severity,     -- 自訂嚴重度欄位
       fr.status
FROM failurereport fr
WHERE fr.assetnum = :assetnum
  AND fr.siteid = 'TRA'
  AND fr.reportdate >= CURRENT_DATE - :days DAYS
ORDER BY fr.reportdate DESC;
```

#### 嚴重度映射

| 值 | 儀表板 | 顏色 |
|----|-------|------|
| `1` / `HIGH` | 高 | red `#ef4444` |
| `2` / `MEDIUM` | 中 | yellow `#f59e0b` |
| `3` / `LOW` | 低 | blue `#4a90d9` |

---

### 3.8 GET `/api/v1/vehicle-kpi` — 維修可靠度 KPI

**Autoscript**: `VDASH_VEHICLE_KPI`
**Maximo MBO**: `FAILUREREPORT` + `METERREADING` + `WORKORDER`
**頁面用途**: vehicle-history.html 維修可靠度指標卡片（MTBF / MDBF / MTTR）

#### Request

```http
GET /api/v1/vehicle-kpi?assetnum=E315&period=365
```

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `assetnum` | string | Y | 車輛編號 |
| `period` | number | N | 計算週期天數：`90` / `180` / `365`（預設 `365`）|

#### Response `200 OK`

```json
{
  "data": {
    "assetnum": "E315",
    "period": 365,
    "calculatedAt": "2026-02-24T08:00:00+08:00",
    "mtbf": {
      "value": 429,
      "unit": "hours",
      "benchmark": 720,
      "pct": 60,
      "grade": "yellow",
      "trend": "up",
      "trendPct": 11,
      "faultCount": 6,
      "faultDates": [
        "2026-02-22", "2026-02-18", "2026-02-12",
        "2026-01-30", "2025-12-15", "2025-11-08"
      ]
    },
    "mdbf": {
      "value": 13900,
      "displayValue": "13.9k",
      "unit": "km",
      "benchmark": 50000,
      "pct": 28,
      "grade": "red",
      "trend": "down",
      "trendPct": 2,
      "yearlyKm": 99000,
      "faultCount": 6
    },
    "mttr": {
      "value": 4.2,
      "unit": "hours",
      "target": 4.0,
      "pct": 48,
      "grade": "red",
      "trend": "flat",
      "trendPct": 0,
      "repairCount": 6,
      "avgRepairHours": 4.2
    }
  }
}
```

#### KPI 計算公式

```python
# VDASH_VEHICLE_KPI.py (Jython)

def calculate_mtbf(assetnum, period_days):
    """MTBF = 總運行時間 / 故障次數"""
    # 取得期間內故障日期
    frSet = getMboSet("FAILUREREPORT")
    frSet.setWhere(
        "assetnum = '%s' and reportdate >= current_date - %d days"
        % (assetnum, period_days)
    )
    fault_dates = sorted([fr.getDate("REPORTDATE") for fr in iterate(frSet)])
    fault_count = len(fault_dates)

    if fault_count < 2:
        return {"value": 0, "pct": 100, "grade": "green", "faultCount": fault_count}

    # 計算故障間隔平均天數 → 轉換為小時
    total_gap_days = 0
    for i in range(1, len(fault_dates)):
        gap = (fault_dates[i] - fault_dates[i-1]).days
        total_gap_days += abs(gap)
    avg_gap_days = total_gap_days / (fault_count - 1)
    mtbf_hours = avg_gap_days * 24

    benchmark = 720  # 30 天 = 720 小時
    pct = min(round(mtbf_hours / benchmark * 100), 100)
    grade = "green" if pct >= 80 else ("yellow" if pct >= 50 else "red")

    return {
        "value": round(mtbf_hours),
        "benchmark": benchmark,
        "pct": pct,
        "grade": grade,
        "faultCount": fault_count
    }


def calculate_mdbf(assetnum, period_days):
    """MDBF = 總行駛里程 / 故障次數"""
    # 年度里程
    mrSet = getMboSet("METERREADING")
    mrSet.setWhere(
        "assetnum = '%s' and metername = 'KM_DAILY' "
        "and readingdate >= current_date - %d days" % (assetnum, period_days)
    )
    total_km = sum([mr.getDouble("READING") for mr in iterate(mrSet)])

    # 故障次數
    frSet = getMboSet("FAILUREREPORT")
    frSet.setWhere(
        "assetnum = '%s' and reportdate >= current_date - %d days"
        % (assetnum, period_days)
    )
    fault_count = frSet.count()

    if fault_count == 0:
        return {"value": 0, "pct": 0, "grade": "red", "faultCount": 0}

    mdbf = total_km / fault_count
    benchmark = 50000  # 50,000 km
    pct = min(round(mdbf / benchmark * 100), 100)
    grade = "green" if pct >= 75 else ("yellow" if pct >= 45 else "red")

    return {
        "value": round(mdbf),
        "benchmark": benchmark,
        "pct": pct,
        "grade": grade,
        "yearlyKm": round(total_km),
        "faultCount": fault_count
    }


def calculate_mttr(assetnum, period_days):
    """MTTR = 總維修時間 / 維修次數"""
    woSet = getMboSet("WORKORDER")
    woSet.setWhere(
        "assetnum = '%s' and worktype in ('CM','EM') "
        "and status in ('COMP','CLOSE') "
        "and schedstart >= current_date - %d days" % (assetnum, period_days)
    )
    durations = [wo.getDouble("ACTLABHRS") for wo in iterate(woSet)
                 if wo.getDouble("ACTLABHRS") > 0]
    repair_count = len(durations)

    if repair_count == 0:
        return {"value": 0, "pct": 100, "grade": "green", "repairCount": 0}

    avg_hours = sum(durations) / repair_count
    target = 4.0  # 目標 4 小時
    efficiency = max(0, (1 - min(avg_hours, 8) / 8)) * 100
    grade = "green" if avg_hours <= 4 else ("yellow" if avg_hours <= 6 else "red")

    return {
        "value": round(avg_hours, 1),
        "target": target,
        "pct": round(efficiency),
        "grade": grade,
        "repairCount": repair_count
    }
```

#### KPI 分級門檻

| 指標 | 綠 (Good) | 黃 (Warning) | 紅 (Critical) |
|------|----------|-------------|--------------|
| **MTBF** | ≥ 80% 基準 (≥576 hr) | ≥ 50% 基準 (≥360 hr) | < 50% 基準 |
| **MDBF** | ≥ 75% 基準 (≥37,500 km) | ≥ 45% 基準 (≥22,500 km) | < 45% 基準 |
| **MTTR** | ≤ 4 hr | ≤ 6 hr | > 6 hr |

#### 趨勢計算

```python
def calculate_trend(current_value, period_days):
    """比較本期 vs 上期同區間"""
    # 本期: [today - period, today]
    # 上期: [today - 2*period, today - period]
    previous_value = calculate_for_period(
        start=today - 2*period, end=today - period
    )
    if previous_value == 0:
        return {"trend": "flat", "trendPct": 0}

    change_pct = round((current_value - previous_value) / previous_value * 100)
    if abs(change_pct) < 3:
        return {"trend": "flat", "trendPct": 0}
    elif change_pct > 0:
        return {"trend": "up", "trendPct": change_pct}
    else:
        return {"trend": "down", "trendPct": abs(change_pct)}
```

---

### 3.9 POST `/api/v1/dynamic-report` — 開立動態回報

**Autoscript**: `VDASH_DYNAMIC_REPORT`
**Maximo MBO**: `WORKORDER` (建立新工單)
**頁面用途**: vehicle-history.html Modal 表單送出

#### Request

```http
POST /api/v1/dynamic-report
Content-Type: application/json
```

```json
{
  "assetnum": "E315",
  "statusCode": "repair",
  "startTime": "2026-02-25T08:00:00+08:00",
  "endTime": "2026-02-28T17:00:00+08:00",
  "remarks": "主電路接觸器更換作業"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `assetnum` | string | Y | 車輛編號 |
| `statusCode` | enum | Y | `repair` / `parts` / `transit` / `decommission` |
| `startTime` | ISO 8601 | N | 預計開始時間 |
| `endTime` | ISO 8601 | N | 預計結束時間 |
| `remarks` | string | N | 備註說明（max 500 chars） |

#### Response `201 Created`

```json
{
  "data": {
    "wonum": "WO-20260224-042",
    "assetnum": "E315",
    "status": "APPR",
    "createdAt": "2026-02-24T14:30:00+08:00"
  }
}
```

#### Response `422 Unprocessable Entity`

```json
{
  "error": {
    "code": "validation_error",
    "message": "欄位驗證失敗",
    "details": [
      {
        "field": "statusCode",
        "message": "無效的狀態碼",
        "code": "invalid_enum"
      }
    ]
  }
}
```

---

## 4. 錯誤處理

### 4.1 統一錯誤格式

```json
{
  "error": {
    "code": "string",
    "message": "人類可讀的錯誤訊息（中文）",
    "details": []
  }
}
```

### 4.2 錯誤代碼表

| HTTP Status | Error Code | 說明 | 常見場景 |
|------------|-----------|------|---------|
| `400` | `bad_request` | 請求參數格式錯誤 | 日期格式不正確 |
| `401` | `unauthorized` | 認證失敗 | API Key 無效或過期 |
| `403` | `forbidden` | 無權存取 | 無該段資料權限 |
| `404` | `asset_not_found` | 車輛不存在 | assetnum 查無資料 |
| `404` | `depot_not_found` | 機務段不存在 | depot code 無效 |
| `422` | `validation_error` | 語意驗證失敗 | 欄位值不合法 |
| `429` | `rate_limit` | 請求過於頻繁 | 超過速率限制 |
| `500` | `maximo_error` | Maximo 內部錯誤 | MBO 查詢失敗 |
| `502` | `upstream_error` | Maximo 服務無回應 | 連線逾時 |
| `503` | `service_unavailable` | 服務暫時不可用 | Maximo 維護中 |

### 4.3 Autoscript 錯誤處理範本

```python
# 每個 Autoscript 的標準錯誤處理
from com.ibm.json.java import JSONObject

try:
    # ... 業務邏輯 ...
    pass
except MXException as e:
    error = JSONObject()
    error.put("code", "maximo_error")
    error.put("message", str(e.getMessage()))
    responseBody = '{"error":' + error.serialize(True) + '}'
    # Maximo autoscript 設定 HTTP status 的方式：
    request.getHttpServletResponse().setStatus(500)
except Exception as e:
    error = JSONObject()
    error.put("code", "internal_error")
    error.put("message", "系統內部錯誤")
    responseBody = '{"error":' + error.serialize(True) + '}'
    request.getHttpServletResponse().setStatus(500)
```

---

## 5. Maximo 自訂屬性需求

### 5.1 需新增的自訂欄位

以下欄位非 Maximo 標準欄位，需透過 Database Configuration 新增：

#### WORKORDER 表

| 欄位名稱 | 資料型別 | 長度 | 說明 |
|---------|---------|------|------|
| `TRA_CTRLMODE` | ALN | 1 | 控制模式 A=主控 / B=被控 / C=輔助 |
| `TRA_OPCODE` | ALN | 10 | 運用號碼（如 "18", "E51"） |
| `TRA_MACODE` | ALN | 10 | 機務指派代碼（如 "CTE18"） |
| `TRA_TRAINSET` | ALN | 500 | 列車編組（JSON: `["7350A","7350"]`） |

#### ASSET 表

| 欄位名稱 | 資料型別 | 長度 | 說明 |
|---------|---------|------|------|
| `TRA_VTYPE` | ALN | 5 | 車型代碼 `e` / `emu` / `dr` |

#### FAILUREREPORT 表

| 欄位名稱 | 資料型別 | 長度 | 說明 |
|---------|---------|------|------|
| `TRA_SEVERITY` | INTEGER | — | 嚴重度 1=高 / 2=中 / 3=低 |

### 5.2 需設定的計量器（Meter）

| Meter Name | 型別 | 單位 | 說明 |
|-----------|------|------|------|
| `KM_DAILY` | CONTINUOUS | km | 每日行駛里程 |
| `KM_TOTAL` | CONTINUOUS | km | 累計總里程 |
| `HOURS_RUN` | CONTINUOUS | hours | 累計運行時數 |

---

## 6. 前端整合範例

### 6.1 API Client 封裝

```javascript
// api-client.js
const API_BASE = '/api/v1';

class MaximoAPI {
  constructor(baseUrl = API_BASE) {
    this.baseUrl = baseUrl;
  }

  async _fetch(endpoint, params = {}) {
    const url = new URL(this.baseUrl + endpoint, window.location.origin);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new APIError(res.status, err.error?.code, err.error?.message);
    }
    return res.json();
  }

  // ── Page: index.html ──
  getDepots()                             { return this._fetch('/depots'); }
  getFleetSummary(depot, date)            { return this._fetch('/fleet-summary', { depot, date }); }
  getDailyOps(depot, date, type = 'all')  { return this._fetch('/daily-ops', { depot, date, type }); }

  // ── Page: vehicle-status.html ──
  getVehicleStatus(type = 'all', depot = 'all') {
    return this._fetch('/vehicle-status', { type, depot });
  }

  // ── Page: vehicle-history.html ──
  getVehicleDetail(assetnum, days = 30)   { return this._fetch('/vehicle-detail', { assetnum, days }); }
  getMaintHistory(assetnum, days = 90)    { return this._fetch('/maint-history', { assetnum, days }); }
  getFaultHistory(assetnum, days = 180)   { return this._fetch('/fault-history', { assetnum, days }); }
  getVehicleKPI(assetnum, period = 365)   { return this._fetch('/vehicle-kpi', { assetnum, period }); }

  // ── Action ──
  async submitDynamicReport(payload) {
    const res = await fetch(this.baseUrl + '/dynamic-report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new APIError(res.status, err.error?.code, err.error?.message);
    }
    return res.json();
  }
}

class APIError extends Error {
  constructor(status, code, message) {
    super(message || `API Error ${status}`);
    this.status = status;
    this.code = code;
  }
}

// Global instance
const api = new MaximoAPI();
```

### 6.2 頁面整合示意（vehicle-history.html）

```javascript
// 取代現有 mock 資料邏輯
async function renderPage() {
  const vehicleId = new URLSearchParams(location.search).get('id');
  if (!vehicleId) { location.href = 'index.html'; return; }

  try {
    // 平行載入所有資料
    const [detail, maint, faults, kpi] = await Promise.all([
      api.getVehicleDetail(vehicleId, currentDayFilter),
      api.getMaintHistory(vehicleId),
      api.getFaultHistory(vehicleId),
      api.getVehicleKPI(vehicleId)
    ]);

    renderHeader(detail.data.asset);
    renderBasicInfo(detail.data.asset);
    renderMileage(detail.data.mileage);
    renderMileageChart(detail.data.mileageChart);
    renderOperationTable(detail.data.operations);
    renderMaintenance(maint.data);
    renderFaults(faults.data);
    renderKPIs(kpi.data);
  } catch (err) {
    if (err instanceof APIError && err.status === 404) {
      showError('找不到車輛資料：' + vehicleId);
    } else {
      showError('載入失敗，請稍後再試');
      console.error(err);
    }
  }
}
```

---

## 7. 頁面 → API → Maximo 對應矩陣

```
┌─────────────────────┬──────────────────────┬───────────────────────────┐
│       前端頁面       │      API 端點         │     Maximo MBO / Script   │
├─────────────────────┼──────────────────────┼───────────────────────────┤
│                     │ GET /depots          │ LOCATIONS                 │
│ index.html          │ GET /fleet-summary   │ ASSET + METERREADING      │
│ (主儀表板)           │ GET /daily-ops       │ WORKORDER + ASSET + METER │
├─────────────────────┼──────────────────────┼───────────────────────────┤
│ vehicle-status.html │ GET /vehicle-status  │ ASSET + WORKORDER         │
│ (狀態總覽)           │                      │                           │
├─────────────────────┼──────────────────────┼───────────────────────────┤
│                     │ GET /vehicle-detail  │ ASSET + WO + METER        │
│ vehicle-history.html│ GET /maint-history   │ WORKORDER (PM/CM)         │
│ (車輛歷程)           │ GET /fault-history   │ FAILUREREPORT             │
│                     │ GET /vehicle-kpi     │ FR + METER + WO (計算)     │
│                     │ POST /dynamic-report │ WORKORDER (建立)           │
└─────────────────────┴──────────────────────┴───────────────────────────┘
```

---

## 8. Autoscript 部署清單

| # | Script Name | Launch Point | HTTP Method | MBO 存取 |
|---|------------|-------------|-------------|---------|
| 1 | `VDASH_DEPOTS` | REST / `depots` | GET | LOCATIONS |
| 2 | `VDASH_FLEET_SUMMARY` | REST / `fleet-summary` | GET | ASSET, METERREADING |
| 3 | `VDASH_DAILY_OPS` | REST / `daily-ops` | GET | WORKORDER, ASSET, METERREADING |
| 4 | `VDASH_VEHICLE_STATUS` | REST / `vehicle-status` | GET | ASSET, WORKORDER |
| 5 | `VDASH_VEHICLE_DETAIL` | REST / `vehicle-detail` | GET | ASSET, WORKORDER, METERREADING, LOCATIONS |
| 6 | `VDASH_MAINT_HISTORY` | REST / `maint-history` | GET | WORKORDER |
| 7 | `VDASH_FAULT_HISTORY` | REST / `fault-history` | GET | FAILUREREPORT |
| 8 | `VDASH_VEHICLE_KPI` | REST / `vehicle-kpi` | GET | FAILUREREPORT, METERREADING, WORKORDER |
| 9 | `VDASH_DYNAMIC_REPORT` | REST / `dynamic-report` | POST | WORKORDER (create) |

### Maximo 建立 Script Launch Point 步驟

```
1. Go to: System Configuration → Platform Configuration → Automation Scripts
2. Create Script:
   - Script Name: VDASH_FLEET_SUMMARY
   - Script Language: jython
   - Paste script code
3. Create Launch Point:
   - Launch Point Type: REST API
   - Resource Name: fleet-summary  (→ URL: /maximo/oslc/script/fleet-summary)
   - HTTP Method: GET
   - Input Variables: depot (ALN), date (ALN)
4. Save & Activate
```

---

## 9. 快取策略

| 端點 | Cache-Control | TTL | 原因 |
|------|--------------|-----|------|
| `/depots` | `public, max-age=300` | 5 min | 機務段資料極少變動 |
| `/fleet-summary` | `private, max-age=60` | 1 min | 摘要可容忍分鐘級延遲 |
| `/daily-ops` | `private, max-age=30` | 30 sec | 運用資料需要較即時 |
| `/vehicle-status` | `private, max-age=30` | 30 sec | 狀態看板需即時 |
| `/vehicle-detail` | `private, max-age=60` | 1 min | 個車詳情可容忍 |
| `/maint-history` | `private, max-age=120` | 2 min | 歷史資料變動慢 |
| `/fault-history` | `private, max-age=120` | 2 min | 歷史資料變動慢 |
| `/vehicle-kpi` | `private, max-age=300` | 5 min | KPI 計算量大，結果穩定 |
| `/dynamic-report` | `no-cache` | — | 寫入操作不快取 |

---

## 10. 速率限制

| 端點分類 | 限制 | Window | 說明 |
|---------|------|--------|------|
| GET (讀取) | 120 req/min | Per user | 儀表板正常使用 |
| POST (寫入) | 10 req/min | Per user | 防止重複提交 |
| KPI 計算 | 30 req/min | Per user | 計算密集型查詢 |

---

## 附錄 A：Maximo Autoscript 完整範例

### VDASH_FLEET_SUMMARY.py

```python
"""
Autoscript: VDASH_FLEET_SUMMARY
Purpose: Return fleet summary statistics for a given depot and date
Launch Point: REST API (GET)
Input: depot (string), date (string, YYYY-MM-DD)
"""
from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
import sys, java

def getParam(name, default=None):
    val = request.getQueryParam(name)
    return val if val else default

try:
    depot = getParam("depot", "MGY00")
    date_str = getParam("date")  # None = today

    server = MXServer.getMXServer()
    ui = userInfo

    # 1. Depot info
    locSet = server.getMboSet("LOCATIONS", ui)
    locSet.setWhere("location = '%s'" % depot)
    locSet.reset()
    locMbo = locSet.moveFirst()

    depotObj = JSONObject()
    depotObj.put("code", depot)
    depotObj.put("name", locMbo.getString("DESCRIPTION") if locMbo else depot)

    # 2. Asset counts by type
    assetSet = server.getMboSet("ASSET", ui)
    assetSet.setWhere("location = '%s' and siteid = 'TRA'" % depot)
    assetSet.reset()

    totalVehicles = 0
    activeVehicles = 0
    byType = {}

    asset = assetSet.moveFirst()
    while asset is not None:
        totalVehicles += 1
        vtype = asset.getString("TRA_VTYPE") or "unknown"
        status = asset.getString("STATUS")

        if vtype not in byType:
            byType[vtype] = {"type": vtype, "count": 0, "active": 0, "totalMileage": 0}
        byType[vtype]["count"] += 1

        if status in ("OPERATING", "ACTIVE"):
            activeVehicles += 1
            byType[vtype]["active"] += 1

        asset = assetSet.moveNext()

    # 3. Mileage from METERREADING
    mrSet = server.getMboSet("METERREADING", ui)
    where = "metername = 'KM_DAILY' and assetnum in " \
            "(select assetnum from asset where location = '%s' and siteid = 'TRA')" % depot
    if date_str:
        where += " and readingdate = '%s'" % date_str
    mrSet.setWhere(where)
    mrSet.reset()

    totalMileage = 0.0
    mr = mrSet.moveFirst()
    while mr is not None:
        reading = mr.getDouble("READING")
        assetnum = mr.getString("ASSETNUM")
        totalMileage += reading
        mr = mrSet.moveNext()

    # Build response
    resp = JSONObject()
    data = JSONObject()
    data.put("depot", depotObj)
    data.put("date", date_str or str(java.util.Date()))

    summary = JSONObject()
    summary.put("totalVehicles", totalVehicles)
    summary.put("activeVehicles", activeVehicles)
    summary.put("totalMileage", round(totalMileage, 1))
    summary.put("avgMileagePerVehicle",
                round(totalMileage / max(activeVehicles, 1), 1))
    data.put("summary", summary)

    typeArr = JSONArray()
    for t in sorted(byType.values(), key=lambda x: x["type"]):
        obj = JSONObject()
        for k, v in t.items():
            obj.put(k, v)
        typeArr.add(obj)
    data.put("byType", typeArr)

    resp.put("data", data)
    responseBody = resp.serialize(True)

except Exception as e:
    err = JSONObject()
    errDetail = JSONObject()
    errDetail.put("code", "maximo_error")
    errDetail.put("message", str(e))
    err.put("error", errDetail)
    responseBody = err.serialize(True)
    request.getHttpServletResponse().setStatus(500)
```

---

## 附錄 B：從 Mock 切換至 API 的遷移步驟

```
Phase 1: 建立基礎設施
  ├── 1.1 Maximo Database Configuration → 新增自訂欄位
  ├── 1.2 部署 9 個 Autoscript + Launch Point
  ├── 1.3 設定 Nginx Reverse Proxy
  └── 1.4 建立 API Key

Phase 2: 前端整合
  ├── 2.1 新增 api-client.js
  ├── 2.2 index.html: 替換 allData mock → api.getDailyOps()
  ├── 2.3 vehicle-status.html: 替換 deterministic hash → api.getVehicleStatus()
  ├── 2.4 vehicle-history.html: 替換 mock records → api calls
  └── 2.5 KPI: 替換 renderKPIs() 的 seed-based 計算 → api.getVehicleKPI()

Phase 3: 測試與上線
  ├── 3.1 Autoscript 單元測試（在 Maximo 測試環境）
  ├── 3.2 前端 Integration Test（Playwright）
  ├── 3.3 效能測試（KPI 端點 < 3 秒）
  └── 3.4 正式環境部署
```
