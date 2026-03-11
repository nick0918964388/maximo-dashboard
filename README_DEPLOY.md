# Car Statement Dashboard - 部署指南

## 在 192.168.1.214 上部署

### 前置條件

- Docker 及 Docker Compose 已安裝
- PostgreSQL 資料庫已運行於 `192.168.1.214:5434`，資料庫名稱 `maximo_data`
- `.env` 檔案已配置正確的資料庫連線資訊

### 啟動服務

```bash
cd /path/to/car_statement
docker compose up -d --build
```

服務啟動後，透過瀏覽器存取：

- 儀表板首頁：`http://192.168.1.214/`
- 車輛狀態頁：`http://192.168.1.214/vehicle-status.html`
- 車輛歷程頁：`http://192.168.1.214/vehicle-history.html`
- 健康檢查：`http://192.168.1.214/api/v1/../health`（透過直接呼叫 API container）

### 停止服務

```bash
docker compose down
```

### 查看日誌

```bash
docker compose logs -f        # 全部服務
docker compose logs -f api    # 僅 API 服務
docker compose logs -f nginx  # 僅 Nginx
```

---

## 端點資料來源一覽

### 使用真實 PostgreSQL 資料的端點

以下端點會查詢 `maximo_data` 資料庫中的真實資料表（前提是資料表已建立且有資料）：

| 端點 | 功能 | 依賴的資料表 |
|------|------|-------------|
| `GET /api/v1/depots` | 機務段列表 | `locations`, `asset`, `workorder` |
| `GET /api/v1/fleet-summary` | 車隊摘要 | `locations`, `asset`, `meterreading` |
| `GET /api/v1/daily-ops` | 每日運用 | `workorder`, `asset`, `meterreading` |
| `GET /api/v1/latest-data-date` | 最新資料日期 | `meterreading`, `asset` |
| `GET /api/v1/vehicle-status` | 車輛狀態總覽 | `asset`, `locations` |
| `GET /api/v1/vehicle-detail` | 車輛詳情 | `asset`, `locations`, `meterreading`, `workorder` |
| `GET /api/v1/maint-history` | 維修歷程 | `workorder` |
| `POST /api/v1/dynamic-report` | 動態報表 | `workorder` |

### 仍使用 Mock 資料的端點（因資料表不存在）

以下端點在後端 SQL 已撰寫，但因對應資料表尚未在 PostgreSQL 中建立，API 呼叫會失敗並 fallback 到前端 Mock 資料：

| 端點 | 功能 | 缺少的資料表 |
|------|------|-------------|
| `GET /api/v1/fault-history` | 故障歷程 | `failurereport` |
| `GET /api/v1/vehicle-kpi` | 車輛 KPI（MTBF/MDBF/MTTR） | `failurereport`, `meterreading` |

> 注意：`vehicle-kpi` 同時依賴 `failurereport` 和 `meterreading` 兩張表。若 `meterreading` 已存在但 `failurereport` 不存在，此端點仍會失敗。

---

## 匯入缺少的資料表

### 1. 建立 failurereport 表

連線至 PostgreSQL 並執行：

```sql
-- 故障紀錄表
CREATE TABLE IF NOT EXISTS tra_prod_failurereport (
    failurecode TEXT,
    assetnum TEXT,
    reportdate TEXT,
    description TEXT,
    severity TEXT,      -- 'high', 'medium', 'low'
    status TEXT,        -- 'INPRG', 'RESOLVED'
    siteid TEXT DEFAULT 'TRATW'
);

-- 建議索引
CREATE INDEX IF NOT EXISTS idx_failurereport_assetnum ON tra_prod_failurereport (assetnum);
CREATE INDEX IF NOT EXISTS idx_failurereport_reportdate ON tra_prod_failurereport (reportdate);
```

### 2. 建立 meterreading 表

```sql
-- 里程紀錄表
CREATE TABLE IF NOT EXISTS tra_prod_meterreading (
    assetnum TEXT,
    metername TEXT,      -- 'KM_DAILY'
    reading TEXT,        -- 里程數值
    readingdate TEXT,
    siteid TEXT DEFAULT 'TRATW'
);

-- 建議索引
CREATE INDEX IF NOT EXISTS idx_meterreading_assetnum ON tra_prod_meterreading (assetnum);
CREATE INDEX IF NOT EXISTS idx_meterreading_readingdate ON tra_prod_meterreading (readingdate);
```

### 3. 匯入資料

透過 `psql` 連線匯入 CSV 或直接 INSERT：

```bash
psql -h 192.168.1.214 -p 5434 -U maximo -d maximo_data -f create_tables.sql
```

或透過 `\copy` 從 CSV 匯入：

```bash
psql -h 192.168.1.214 -p 5434 -U maximo -d maximo_data \
  -c "\copy tra_prod_failurereport FROM 'failurereport.csv' WITH CSV HEADER"

psql -h 192.168.1.214 -p 5434 -U maximo -d maximo_data \
  -c "\copy tra_prod_meterreading FROM 'meterreading.csv' WITH CSV HEADER"
```

---

## 匯入資料後切換到真實查詢

### 目前的 Fallback 機制

前端配置檔 `js/config.js` 已設定為 `mode: 'api'`。DataService 的行為如下：

1. 優先呼叫後端 API（真實 PostgreSQL 查詢）
2. 若 API 回傳 5xx 錯誤（例如資料表不存在），自動 fallback 到前端 Mock 資料
3. 頁面會顯示黃色 banner 提示正在使用離線資料

### 資料表建立後不需額外操作

後端程式碼 `backend/main.py` 中的 SQL 查詢已經撰寫完畢。一旦對應資料表在 PostgreSQL 中建立並匯入資料：

1. **不需修改任何程式碼** -- API 端點會自動查詢到資料並回傳成功
2. **Fallback 自動解除** -- 下次呼叫成功時，DataService 會自動恢復 API 模式
3. **黃色 banner 自動消失**

### 驗證步驟

資料匯入完成後，可透過以下方式驗證：

```bash
# 測試 fault-history 端點
curl "http://192.168.1.214/api/v1/fault-history?assetnum=E200&days=180"

# 測試 vehicle-kpi 端點
curl "http://192.168.1.214/api/v1/vehicle-kpi?assetnum=E200&period=365"

# 健康檢查（確認資料庫連線正常）
curl "http://192.168.1.214:8000/health"
```

若回傳正常 JSON 資料而非錯誤訊息，表示切換成功。

---

## 重要注意事項

### 後端 SQL 表名對應

目前 `backend/main.py` 中的 SQL 使用的表名為：

| 程式碼中的表名 | 說明 |
|---------------|------|
| `locations` | 機務段/地點 |
| `asset` | 車輛資產 |
| `workorder` | 工單 |
| `meterreading` | 里程紀錄 |
| `failurereport` | 故障紀錄 |

若實際 PostgreSQL 中的表名帶有前綴（如 `tra_prod_failurereport`），需要在資料庫中建立 VIEW 或修改 `backend/main.py` 中的表名來對應。例如：

```sql
-- 方法一：建立 VIEW 對應
CREATE VIEW failurereport AS SELECT * FROM tra_prod_failurereport;
CREATE VIEW meterreading AS SELECT * FROM tra_prod_meterreading;

-- 方法二：直接修改 backend/main.py 中的 SQL 查詢
-- 將 failurereport 替換為 tra_prod_failurereport
-- 將 meterreading 替換為 tra_prod_meterreading
```

### .env 設定

確保 `.env` 檔案中的資料庫連線資訊正確：

```env
DB_HOST=192.168.1.214
DB_PORT=5434
DB_NAME=maximo_data
DB_USER=maximo
DB_PASSWORD=maximo2026
```
