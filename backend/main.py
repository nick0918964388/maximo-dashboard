"""
FastAPI application — car statement backend.

Provides REST API endpoints under /api/v1/ plus a health-check.
All database queries use asyncpg parameterised queries ($1, $2 ...).
Queries target the actual PostgreSQL tables:
  - tra_prod_mxasset (vehicle asset master)
  - tra_prod_zz_trainstatement (train operation reports)
  - tra_prod_zz_trainstatus (vehicle dynamic status)
"""

import ast
import json
import logging
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from contextlib import asynccontextmanager

from database import lifespan as _db_lifespan, get_pool

logger = logging.getLogger("car_statement")

# ---------------------------------------------------------------------------
# Mapping tables
# ---------------------------------------------------------------------------
# Populated at startup from tra_prod_zz_dept
DEPOT_NAMES: dict[str, str] = {}

TYPE_LABELS = {"e": "電力機車", "emu": "電聯車", "dr": "柴油客車", "pp": "PP客車", "ck": "莒光號"}

EQ11_STATUS_MAP = {
    "RSTA": {"status": "available", "label": "可用", "color": "green"},
    "RSTL": {"status": "operating", "label": "運用中", "color": "green"},
    "RSTF": {"status": "repair", "label": "檢修", "color": "red"},
    "RSTP": {"status": "decommission", "label": "停用", "color": "red"},
}

DYNAMIC_STATUS_MAP = {
    # --- 綠燈：正常可用 ---
    "70": {"status": "available", "label": "可用", "color": "green"},
    "10": {"status": "available", "label": "待命", "color": "green"},
    "20": {"status": "operating", "label": "運用中", "color": "green"},
    # --- 黃燈：回送 / 試車 ---
    "62": {"status": "test", "label": "試駛", "color": "yellow"},
    "91": {"status": "transit", "label": "回送", "color": "yellow"},
    # --- 紅燈：檢修 / 保養 / 停用 ---
    "00": {"status": "decommission", "label": "待報廢", "color": "red"},
    "01": {"status": "repair", "label": "待進廠", "color": "red"},
    "21": {"status": "repair", "label": "臨修", "color": "red"},
    "22": {"status": "parts", "label": "待料", "color": "red"},
    "24": {"status": "repair", "label": "送鏇輪", "color": "red"},
    "25": {"status": "repair", "label": "換車輪", "color": "red"},
    "30": {"status": "repair", "label": "保養進廠", "color": "red"},
    "31": {"status": "repair", "label": "四級保養", "color": "red"},
    "40": {"status": "repair", "label": "臨修進廠", "color": "red"},
    "41": {"status": "repair", "label": "廠修", "color": "red"},
    "43": {"status": "decommission", "label": "待報廢", "color": "red"},
    "44": {"status": "parts", "label": "待換車輪", "color": "red"},
    "50": {"status": "decommission", "label": "停用", "color": "red"},
    "52": {"status": "decommission", "label": "待報廢", "color": "red"},
    "54": {"status": "parts", "label": "待料", "color": "red"},
    "60": {"status": "repair", "label": "臨修", "color": "red"},
    "61": {"status": "decommission", "label": "待報廢", "color": "red"},
    "65": {"status": "repair", "label": "停用待修", "color": "red"},
    "66": {"status": "repair", "label": "進廠", "color": "red"},
    "68": {"status": "repair", "label": "在段檢修", "color": "red"},
    "90": {"status": "repair", "label": "改造", "color": "red"},
}

WORKTYPE_MAP = {
    "01": "日常保養",
    "C2": "臨修",
    "2A": "二級保養A",
    "1B": "一級保養B",
    "C9": "特殊檢修",
    "3A": "三級保養A",
    "02": "日檢",
    "2B": "二級保養B",
    "03": "月檢",
    "C3": "臨修C3",
    "3B": "三級保養B",
    "2C": "二級保養C",
    "4A": "四級保養A",
    "C1": "臨修C1",
    "4B": "四級保養B",
    "CA": "事故修復",
    "C4": "臨修C4",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def get_vehicle_type(eq3: Optional[str]) -> Optional[str]:
    """Map eq3 vehicle class code to frontend e/emu/dr category.

    Supports both car-group-level eq3 (EMU, TEMU, E, DR) and
    individual-car eq3 (PPC, PPT, EM, EP, DC, DHL, etc.).
    """
    if eq3 is None:
        return None
    eq3 = eq3.upper()

    # --- EMU (電聯車) ---
    # Car group types
    if eq3 in ("EMU", "TEM", "TEMU"):
        return "emu"
    # Push-Pull series individual cars (PP客車)
    if eq3.startswith("PP"):  # PPC, PPT, PPH, PPP, PPM, PPD
        return "pp"
    # EMU component cars (resolved or direct)
    if eq3 in ("EM", "EP", "ED", "ET", "EMC", "EMB", "EMA", "EME"):
        return "emu"
    # Tilting EMU component cars
    if eq3 in ("TEP", "TED"):
        return "emu"
    # --- E (電力機車) ---
    if eq3 == "E":
        return "e"

    # --- CK (莒光號) — zz_carclass=2 ---
    if eq3 in ("FPK", "FP", "PC", "DC", "SP"):
        return "ck"

    # --- DR (柴油客車/柴油機車/柴液機車) ---
    if eq3.startswith("DR") or eq3.startswith("DH"):  # DR, DHL
        return "dr"
    if eq3 in ("R", "DC", "DT", "DL"):
        return "dr"

    return None


def _extract_time(iso_str: Optional[str]) -> str:
    """Extract HH:MM from a 1970-01-01T06:22:00+08:00 style string."""
    if not iso_str:
        return ""
    try:
        # Find the T separator and take HH:MM after it
        t_idx = iso_str.index("T")
        return iso_str[t_idx + 1 : t_idx + 6]  # "HH:MM"
    except (ValueError, IndexError):
        return ""


def _parse_trainstatementline(raw: Optional[str]) -> list[dict]:
    """Parse zz_trainstatementline text field into a Python list of dicts.

    The field stores Python-repr format (single quotes, True/False),
    NOT valid JSON, so we use ast.literal_eval with json.loads as fallback.
    """
    if not raw:
        return []
    try:
        data = ast.literal_eval(raw)
        if isinstance(data, list):
            return data
        return []
    except (ValueError, SyntaxError):
        pass
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _eq11_info(eq11: Optional[str]) -> dict:
    """Return status info dict from eq11 code."""
    if eq11 and eq11 in EQ11_STATUS_MAP:
        return EQ11_STATUS_MAP[eq11]
    return {"status": "unknown", "label": "未知", "color": "green"}


# ---------------------------------------------------------------------------
# Application
# ---------------------------------------------------------------------------
async def _load_depot_names():
    """Load depot names from tra_prod_zz_dept at startup."""
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT department, description FROM tra_prod_zz_dept "
            "WHERE status = 'ACTIVE' AND type = '2' ORDER BY department"
        )
    for r in rows:
        code = r["department"]
        if code:
            DEPOT_NAMES[code] = r["description"] or code
    logger.info("Loaded %d depot names from tra_prod_zz_dept", len(DEPOT_NAMES))


@asynccontextmanager
async def lifespan(app):
    async with _db_lifespan(app):
        await _load_depot_names()
        yield


app = FastAPI(
    title="Car Statement API",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Unified error handlers
# ---------------------------------------------------------------------------
@app.exception_handler(HTTPException)
async def http_exception_handler(_request: Request, exc: HTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": str(exc.status_code), "message": exc.detail}},
    )


@app.exception_handler(Exception)
async def general_exception_handler(_request: Request, exc: Exception):
    logger.exception("Unhandled exception")
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "500", "message": str(exc)}},
    )


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.get("/health")
async def health():
    """Basic liveness probe."""
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {"status": "healthy", "database": "connected"}
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "database": "disconnected",
                "detail": str(exc),
            },
        )


# ---------------------------------------------------------------------------
# 1. GET /api/v1/depots
# ---------------------------------------------------------------------------
@app.get("/api/v1/depots")
async def get_depots():
    """Return all depot locations with summary statistics."""
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT eq2,
                       COUNT(*)                                              AS vehicle_count,
                       COUNT(*) FILTER (WHERE eq11 IN ('RSTA', 'RSTL'))      AS available_count,
                       COUNT(*) FILTER (WHERE eq11 = 'RSTF')                 AS pending_maintenance
                FROM   tra_prod_mxasset
                WHERE  (eq9 = '車組'
                   OR  (eq9 = '車輛' AND eq3 IN (
                            'E',
                            'FPK', 'FP', 'PC', 'SP',
                            'DR', 'DHL', 'DL', 'DT', 'R',
                            'PPC', 'PPT', 'PPH', 'PPP', 'PPM', 'PPD'
                        )))
                GROUP  BY eq2
                ORDER  BY eq2
                """
            )

        data = []
        for r in rows:
            code = r["eq2"] or ""
            total = int(r["vehicle_count"])
            avail = int(r["available_count"])
            rate = round(avail / total * 100, 1) if total > 0 else 0.0
            data.append(
                {
                    "code": code,
                    "name": DEPOT_NAMES.get(code, code),
                    "vehicleCount": total,
                    "availabilityRate": rate,
                    "pendingMaintenance": int(r["pending_maintenance"]),
                }
            )

        return {
            "data": data,
            "meta": {"total": len(data), "generatedAt": _now_iso()},
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 2. GET /api/v1/fleet-summary
# ---------------------------------------------------------------------------
@app.get("/api/v1/fleet-summary")
async def get_fleet_summary(
    depot: str = Query(..., description="Depot code, e.g. MGY00"),
    date: str = Query(..., description="Date in YYYY-MM-DD"),
):
    """Fleet summary for a specific depot and date."""
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            # Vehicle stats from asset master
            asset_rows = await conn.fetch(
                """
                SELECT eq3,
                       COUNT(*)                                          AS cnt,
                       COUNT(*) FILTER (WHERE eq11 IN ('RSTA', 'RSTL'))  AS active
                FROM   tra_prod_mxasset
                WHERE  eq2 = $1
                  AND  (eq9 = '車組'
                   OR  (eq9 = '車輛' AND eq3 IN (
                            'E',
                            'FPK', 'FP', 'PC', 'SP',
                            'DR', 'DHL', 'DL', 'DT', 'R',
                            'PPC', 'PPT', 'PPH', 'PPP', 'PPM', 'PPD'
                        )))
                GROUP  BY eq3
                ORDER  BY eq3
                """,
                depot,
            )

            # Mileage stats from train statement
            mileage_rows = await conn.fetch(
                """
                SELECT COALESCE(SUM(mileage::numeric), 0) AS total_mileage
                FROM   tra_prod_zz_trainstatement
                WHERE  deptid = $1
                  AND  trainstatement_date LIKE $2 || '%'
                """,
                depot,
                date,
            )

            # 7-day average daily mileage
            date_obj = datetime.strptime(date, "%Y-%m-%d").date()
            avg7_rows = await conn.fetch(
                """
                SELECT COALESCE(AVG(daily_km), 0) AS avg_daily_km
                FROM (
                    SELECT trainstatement_date::date AS d,
                           SUM(mileage::numeric)     AS daily_km
                    FROM   tra_prod_zz_trainstatement
                    WHERE  deptid = $1
                      AND  trainstatement_date::date
                           BETWEEN ($2::timestamp - INTERVAL '6 days')::date AND $2
                    GROUP  BY trainstatement_date::date
                ) sub
                """,
                depot,
                date_obj,
            )
            avg7_mileage = float(avg7_rows[0]["avg_daily_km"]) if avg7_rows else 0.0

        total_mileage = float(mileage_rows[0]["total_mileage"]) if mileage_rows else 0.0

        by_type = []
        total_vehicles = 0
        active_vehicles = 0

        for r in asset_rows:
            eq3 = r["eq3"]
            vtype = get_vehicle_type(eq3)
            if vtype is None:
                continue
            cnt = int(r["cnt"])
            act = int(r["active"])
            total_vehicles += cnt
            active_vehicles += act
            by_type.append(
                {
                    "type": vtype,
                    "typeLabel": TYPE_LABELS.get(vtype, eq3 or ""),
                    "eq3": eq3,
                    "count": cnt,
                    "active": act,
                    "totalMileage": 0.0,
                    "avgMileage": 0.0,
                }
            )

        # Distribute total mileage proportionally by vehicle count
        if total_vehicles > 0 and total_mileage > 0:
            for bt in by_type:
                ratio = bt["count"] / total_vehicles
                bt["totalMileage"] = round(total_mileage * ratio, 1)
                bt["avgMileage"] = round(bt["totalMileage"] / bt["count"], 1) if bt["count"] else 0

        depot_name = DEPOT_NAMES.get(depot, depot)

        return {
            "data": {
                "depot": {"code": depot, "name": depot_name},
                "date": date,
                "summary": {
                    "totalVehicles": total_vehicles,
                    "activeVehicles": active_vehicles,
                    "totalMileage": round(total_mileage, 1),
                    "avgMileagePerVehicle": (
                        round(total_mileage / total_vehicles, 1) if total_vehicles else 0
                    ),
                    "avg7DayMileage": round(avg7_mileage, 1),
                },
                "byType": by_type,
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 3. GET /api/v1/daily-ops
# ---------------------------------------------------------------------------
@app.get("/api/v1/daily-ops")
async def get_daily_ops(
    depot: str = Query(...),
    date: str = Query(...),
    type: Optional[str] = Query("all", description="Vehicle type filter: all, e, emu, dr"),
):
    """Daily operations for a depot on a given date.

    Uses three tables:
      - tra_prod_zz_trainstatement: train runs (trainsno) grouped by trainsgrpid
      - tra_prod_zz_trainstatement_zz_trainstatementline: car composition per trainsgrpid
      - tra_prod_mxasset: vehicle type lookup (eq3 → e/emu/dr)
    """
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            # 1) Fetch all statement rows for this depot + date
            rows = await conn.fetch(
                """
                SELECT trainsgrpid, planid, ma_planid,
                       trainsno, trainsseq, mileage,
                       trainsno_s_time, trainsno_e_time,
                       from_station, to_station,
                       control, becontrol
                FROM   tra_prod_zz_trainstatement
                WHERE  deptid = $1
                  AND  trainstatement_date LIKE $2 || '%'
                ORDER  BY trainsgrpid, trainsseq::int
                """,
                depot,
                date,
            )

            # 2) Collect distinct trainsgrpids, then bulk-fetch their car lines
            grpids = list({r["trainsgrpid"] for r in rows if r["trainsgrpid"]})

            line_rows = await conn.fetch(
                """
                SELECT trainsgrpid, assetnum, assetnum_simple, type,
                       control2, becontrol, trainsseq
                FROM   tra_prod_zz_trainstatement_zz_trainstatementline
                WHERE  trainsgrpid = ANY($1)
                ORDER  BY trainsgrpid, trainsseq::int
                """,
                grpids,
            ) if grpids else []

            # 3) Build lines lookup: grpid → list of car dicts
            lines_by_grp: dict[str, list[dict]] = {}
            all_assetnums: set[str] = set()
            for lr in line_rows:
                gid = lr["trainsgrpid"] or ""
                an = lr["assetnum"] or ""
                if an:
                    all_assetnums.add(an)
                lines_by_grp.setdefault(gid, []).append({
                    "assetnum": an,
                    "assetnumSimple": lr["assetnum_simple"] or "",
                    "type": lr["type"] or "",
                    "control2": lr["control2"] == "True",
                    "becontrol": lr["becontrol"] == "True",
                })

            # 4) Bulk-query asset types from mxasset, resolving via zz_cargroup
            asset_type_map: dict[str, Optional[str]] = {}
            if all_assetnums:
                asset_rows = await conn.fetch(
                    """
                    SELECT a.assetnum,
                           COALESCE(g.eq3, a.eq3) AS resolved_eq3
                    FROM   tra_prod_mxasset a
                    LEFT JOIN tra_prod_mxasset g
                           ON g.assetnum = a.zz_cargroup
                          AND g.eq9 LIKE '%組%'
                    WHERE  a.assetnum = ANY($1)
                    """,
                    list(all_assetnums),
                )
                for ar in asset_rows:
                    asset_type_map[ar["assetnum"]] = get_vehicle_type(
                        ar["resolved_eq3"]
                    )

        # 5) Group statement rows by trainsgrpid
        groups: dict[str, dict] = {}
        for r in rows:
            grp_id = r["trainsgrpid"] or ""

            train_entry = {
                "trainsno": r["trainsno"] or "",
                "trainsseq": r["trainsseq"],
                "startTime": _extract_time(r["trainsno_s_time"]),
                "endTime": _extract_time(r["trainsno_e_time"]),
                "fromStation": r["from_station"] or "",
                "toStation": r["to_station"] or "",
                "mileage": round(float(r["mileage"]), 1) if r["mileage"] else 0,
            }

            if grp_id not in groups:
                groups[grp_id] = {
                    "trainsgrpid": grp_id,
                    "planid": r["planid"] or "",
                    "maPlanid": r["ma_planid"] or "",
                    "trains": [],
                    "totalMileage": 0,
                    "control": r["control"] or "",
                    "becontrol": r["becontrol"] or "",
                }

            groups[grp_id]["trains"].append(train_entry)
            groups[grp_id]["totalMileage"] += train_entry["mileage"]

        # 6) Transform to frontend vehicles[] format
        vehicles = []
        for op in groups.values():
            grp_id = op["trainsgrpid"]
            op["totalMileage"] = round(op["totalMileage"], 1)
            car_lines = lines_by_grp.get(grp_id, [])

            train_numbers = [t["trainsno"] for t in op["trains"] if t["trainsno"]]
            start_time = op["trains"][0]["startTime"] if op["trains"] else ""
            end_time = op["trains"][-1]["endTime"] if op["trains"] else ""

            # Determine vehicle type and display ID from car lines
            vtype = None
            display_id = grp_id
            real_assetnum = None  # full assetnum for numeric display IDs
            for car in car_lines:
                an = car["assetnum"]
                if an and not vtype:
                    vtype = asset_type_map.get(an)
                simple = car["assetnumSimple"]
                if simple and display_id == grp_id:
                    display_id = simple
                    real_assetnum = an  # keep the full assetnum
                elif an and display_id == grp_id:
                    display_id = an
                if vtype and display_id != grp_id:
                    break

            # Determine control type
            ctrl = "A"
            for car in car_lines:
                if car["control2"]:
                    ctrl = "A"
                    break
                if car["becontrol"]:
                    ctrl = "B"
                    break

            # Apply type filter
            if type and type != "all" and vtype and vtype != type:
                continue

            # Fallback: numeric-only IDs are PP客車
            if not vtype and display_id.isdigit():
                vtype = "pp"

            vehicle_entry = {
                "id": display_id,
                "type": vtype or "emu",
                "ctrl": ctrl,
                "opCode": op["planid"],
                "ma": op["maPlanid"],
                "trains": train_numbers,
                "start": start_time,
                "end": end_time,
                "mileage": op["totalMileage"],
                "days": 1,
            }
            # Include real assetnum for numeric display IDs (e.g. 4-digit car numbers)
            if real_assetnum and display_id.isdigit():
                vehicle_entry["assetnum"] = real_assetnum
            vehicles.append(vehicle_entry)

        return {
            "data": {"date": date, "depot": depot, "vehicles": vehicles},
            "meta": {
                "total": len(vehicles),
                "generatedAt": _now_iso(),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 4. GET /api/v1/latest-data-date
# ---------------------------------------------------------------------------
@app.get("/api/v1/latest-data-date")
async def get_latest_data_date(
    depot: Optional[str] = Query(None),
):
    """Return the most recent data date available."""
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            if depot:
                row = await conn.fetchrow(
                    """
                    SELECT MAX(trainstatement_date) AS latest
                    FROM   tra_prod_zz_trainstatement
                    WHERE  deptid = $1
                    """,
                    depot,
                )
            else:
                row = await conn.fetchrow(
                    "SELECT MAX(trainstatement_date) AS latest FROM tra_prod_zz_trainstatement"
                )

        latest = row["latest"] if row else None
        # Strip time portion: "2026-03-11T00:00:00+08:00" → "2026-03-11"
        if latest and "T" in latest:
            latest = latest.split("T")[0]
        return {"data": {"date": latest}}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 5. GET /api/v1/vehicle-status
# ---------------------------------------------------------------------------
@app.get("/api/v1/vehicle-status")
async def get_vehicle_status(
    type: Optional[str] = Query("all"),
    depot: Optional[str] = Query("all"),
):
    """Vehicle status overview with colour-coded health."""
    pool = get_pool()
    try:
        # Build dynamic WHERE clause
        conditions = [
            "(eq9 = '車組' OR (eq9 = '車輛' AND eq3 IN ("
            "'E','FPK','FP','PC','SP',"
            "'DR','DHL','DL','DT','R',"
            "'PPC','PPT','PPH','PPP','PPM','PPD')))"
        ]
        params: list = []
        idx = 1

        if type and type != "all":
            # We filter by eq3 mapping later in Python since the mapping
            # is not a simple 1:1 column value. But we can pre-filter for
            # known eq3 values.
            pass

        if depot and depot != "all":
            conditions.append(f"eq2 = ${idx}")
            params.append(depot)
            idx += 1

        where_clause = " AND ".join(conditions)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT assetnum, eq2, eq3, eq4, eq11, zz_cargroup
                FROM   tra_prod_mxasset
                WHERE  {where_clause}
                ORDER  BY eq3, assetnum
                """,
                *params,
            )

            # Get dynamic status records active TODAY based on actstart/actfinish:
            # - both set: today falls between actstart and actfinish
            # - only actstart: today >= actstart (ongoing, no end date)
            # - only actfinish: today <= actfinish
            # - neither: always active (permanent status)
            dynamic_rows = await conn.fetch(
                """
                SELECT assetnum, dynamicstatus, description, worktype,
                       actstart, actfinish
                FROM   tra_prod_zz_trainstatus
                WHERE  (
                    (actstart IS NOT NULL AND actstart != '' AND actfinish IS NOT NULL AND actfinish != ''
                     AND CURRENT_DATE >= CAST(actstart AS timestamptz)::date
                     AND CURRENT_DATE <= CAST(actfinish AS timestamptz)::date)
                    OR
                    (actstart IS NOT NULL AND actstart != '' AND (actfinish IS NULL OR actfinish = '')
                     AND CURRENT_DATE >= CAST(actstart AS timestamptz)::date)
                    OR
                    ((actstart IS NULL OR actstart = '') AND actfinish IS NOT NULL AND actfinish != ''
                     AND CURRENT_DATE <= CAST(actfinish AS timestamptz)::date)
                    OR
                    ((actstart IS NULL OR actstart = '') AND (actfinish IS NULL OR actfinish = ''))
                )
                """
            )

        # Build dynamic status lookup
        dynamic_map: dict[str, dict] = {}
        for dr in dynamic_rows:
            an = dr["assetnum"]
            ds = dr["dynamicstatus"] or ""
            info = DYNAMIC_STATUS_MAP.get(ds, {"status": "repair", "label": ds or "不可用", "color": "red"})
            dynamic_map[an] = {
                **info,
                "dynamicstatus": ds,
                "description": dr["description"] or "",
                "worktype": dr["worktype"] or "",
                "worktypeLabel": WORKTYPE_MAP.get(dr["worktype"] or "", dr["worktype"] or ""),
            }

        # Group by type
        type_map: dict[str, dict] = {}
        summary = {"total": 0, "green": 0, "yellow": 0, "red": 0}

        for r in rows:
            eq3 = r["eq3"]
            vtype = get_vehicle_type(eq3)
            if vtype is None:
                continue

            # Apply type filter
            if type and type != "all" and vtype != type:
                continue

            assetnum = r["assetnum"] or ""
            eq11 = r["eq11"]
            eq11_info = _eq11_info(eq11)

            # Dynamic status (today's active record) determines traffic light;
            # no active record → default green (可用)
            dyn = dynamic_map.get(assetnum)
            if dyn:
                color = dyn["color"]
                status_label = dyn["label"]
                status_key = dyn["status"]
            else:
                _default = DYNAMIC_STATUS_MAP["70"]
                color = _default["color"]
                status_label = _default["label"]
                status_key = _default["status"]

            summary["total"] += 1
            summary[color] = summary.get(color, 0) + 1

            if vtype not in type_map:
                type_map[vtype] = {
                    "type": vtype,
                    "typeLabel": TYPE_LABELS.get(vtype, eq3 or ""),
                    "total": 0,
                    "green": 0,
                    "yellow": 0,
                    "red": 0,
                    "vehicles": [],
                }

            bucket = type_map[vtype]
            bucket["total"] += 1
            bucket[color] = bucket.get(color, 0) + 1
            bucket["vehicles"].append(
                {
                    "id": assetnum,
                    "eq4": r["eq4"] or "",
                    "eq11": eq11 or "",
                    "cargroup": r["zz_cargroup"] or "",
                    "status": status_key,
                    "statusLabel": status_label,
                    "statusColor": color,
                    "depot": r["eq2"] or "",
                    "depotName": DEPOT_NAMES.get(r["eq2"] or "", r["eq2"] or ""),
                    "dynamic": dyn if dyn else None,
                }
            )

        return {
            "data": {
                "summary": summary,
                "byType": list(type_map.values()),
            },
            "meta": {"generatedAt": _now_iso()},
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 6. GET /api/v1/vehicle-detail
# ---------------------------------------------------------------------------
@app.get("/api/v1/vehicle-detail")
async def get_vehicle_detail(
    assetnum: str = Query(...),
    days: int = Query(30),
):
    """Detailed information for a single vehicle (car group)."""
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            # Asset info
            asset = await conn.fetchrow(
                """
                SELECT assetnum, eq2, eq3, eq4, eq8, eq9, eq10, eq11,
                       zz_cargroup, status
                FROM   tra_prod_mxasset
                WHERE  assetnum = $1
                """,
                assetnum,
            )

            # Fallback: numeric-only IDs (e.g. "1123") → resolve via
            # trainstatementline mapping or mxasset last-N-digits match
            if not asset and assetnum.isdigit():
                resolved = await conn.fetchval(
                    """
                    SELECT DISTINCT l.assetnum
                    FROM   tra_prod_zz_trainstatement_zz_trainstatementline l
                    WHERE  l.assetnum_simple = $1
                    LIMIT 1
                    """,
                    assetnum,
                )
                if resolved:
                    assetnum = resolved
                    asset = await conn.fetchrow(
                        """
                        SELECT assetnum, eq2, eq3, eq4, eq8, eq9, eq10, eq11,
                               zz_cargroup, status
                        FROM   tra_prod_mxasset
                        WHERE  assetnum = $1
                        """,
                        assetnum,
                    )

            if not asset:
                raise HTTPException(status_code=404, detail=f"Asset {assetnum} not found")

            # Operation records: find via trainstatementline table
            ops_rows = await conn.fetch(
                """
                SELECT DISTINCT s.trainstatement_date,
                       s.planid, s.ma_planid,
                       s.trainsno, s.trainsseq, s.mileage,
                       s.trainsno_s_time, s.trainsno_e_time,
                       s.from_station, s.to_station,
                       s.trainsgrpid
                FROM   tra_prod_zz_trainstatement s
                JOIN   tra_prod_zz_trainstatement_zz_trainstatementline l
                       ON l.trainsgrpid = s.trainsgrpid
                WHERE  l.assetnum = $1
                  AND  s.trainstatement_date::date >= CURRENT_DATE - make_interval(days => $2)
                ORDER  BY s.trainstatement_date DESC, s.trainsseq
                """,
                assetnum,
                days,
            )

            # Current dynamic status
            dyn_row = await conn.fetchrow(
                """
                SELECT dynamicstatus, actstart, description, worktype, deptid
                FROM   tra_prod_zz_trainstatus
                WHERE  assetnum = $1
                  AND  actfinish IS NULL
                ORDER  BY actstart DESC
                LIMIT  1
                """,
                assetnum,
            )

        eq3 = asset["eq3"]
        vtype = get_vehicle_type(eq3)
        eq11 = asset["eq11"]
        eq11_info = _eq11_info(eq11)
        depot_code = asset["eq2"] or ""

        # Dynamic status
        dynamic_info = None
        if dyn_row:
            ds = dyn_row["dynamicstatus"] or ""
            ds_info = DYNAMIC_STATUS_MAP.get(ds, {"status": "repair", "label": ds or "不可用", "color": "red"})
            dynamic_info = {
                **ds_info,
                "dynamicstatus": ds,
                "description": dyn_row["description"] or "",
                "worktype": dyn_row["worktype"] or "",
                "worktypeLabel": WORKTYPE_MAP.get(dyn_row["worktype"] or "", ""),
                "actstart": dyn_row["actstart"] or "",
            }

        # Mileage chart: group by date and sum
        mileage_by_date: dict[str, float] = {}
        operations = []
        for r in ops_rows:
            dt_raw = r["trainstatement_date"] or ""
            dt = dt_raw.split("T")[0] if "T" in dt_raw else dt_raw
            mil = float(r["mileage"]) if r["mileage"] else 0
            mileage_by_date[dt] = mileage_by_date.get(dt, 0) + mil

            operations.append(
                {
                    "date": dt,
                    "planid": r["planid"] or "",
                    "maPlanid": r["ma_planid"] or "",
                    "trainsno": r["trainsno"] or "",
                    "trainsseq": r["trainsseq"],
                    "startTime": _extract_time(r["trainsno_s_time"]),
                    "endTime": _extract_time(r["trainsno_e_time"]),
                    "fromStation": r["from_station"] or "",
                    "toStation": r["to_station"] or "",
                    "mileage": round(mil, 1),
                    "trainsgrpid": r["trainsgrpid"] or "",
                }
            )

        # Group operations by date+planid for frontend
        grouped: dict[str, dict] = {}
        for op in operations:
            key = f"{op['date']}|{op['planid']}"
            if key not in grouped:
                grouped[key] = {
                    "date": op["date"],
                    "opCode": op["planid"],
                    "ma": op["maPlanid"],
                    "trains": [],
                    "start": op["startTime"],
                    "end": op["endTime"],
                    "mileage": 0,
                    "ctrl": "A",
                }
            g = grouped[key]
            g["trains"].append(op["trainsno"])
            g["mileage"] += op["mileage"]
            # Update time range
            if op["startTime"] and (not g["start"] or op["startTime"] < g["start"]):
                g["start"] = op["startTime"]
            if op["endTime"] and (not g["end"] or op["endTime"] > g["end"]):
                g["end"] = op["endTime"]

        grouped_ops = sorted(grouped.values(), key=lambda x: x["date"], reverse=True)
        for g in grouped_ops:
            g["mileage"] = round(g["mileage"], 1)

        mileage_chart = [
            {"date": dt, "km": round(km, 1)}
            for dt, km in sorted(mileage_by_date.items())
        ]
        total_km = sum(km for km in mileage_by_date.values())
        daily_avg = total_km / days if days else 0

        return {
            "data": {
                "asset": {
                    "id": asset["assetnum"],
                    "type": vtype,
                    "typeLabel": TYPE_LABELS.get(vtype, eq3 or "") if vtype else (eq3 or ""),
                    "eq3": eq3,
                    "eq4": asset["eq4"] or "",
                    "cargroup": asset["zz_cargroup"] or "",
                    "depot": depot_code,
                    "depotName": DEPOT_NAMES.get(depot_code, depot_code),
                    "deliveryDate": asset["eq10"] or "",
                    "status": eq11_info["status"],
                    "statusLabel": eq11_info["label"],
                    "statusColor": eq11_info["color"],
                    "dynamic": dynamic_info,
                },
                "mileage": {
                    "totalKm": round(total_km, 1),
                    "dailyAvgKm": round(daily_avg, 1),
                    "monthlyKm": round(daily_avg * 30, 1),
                    "yearlyKm": round(daily_avg * 365, 1),
                },
                "mileageChart": mileage_chart,
                "operations": grouped_ops,
            },
            "meta": {
                "days": days,
                "operationCount": len(grouped_ops),
                "generatedAt": _now_iso(),
            },
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 7. GET /api/v1/maint-history
# ---------------------------------------------------------------------------
@app.get("/api/v1/maint-history")
async def get_maint_history(
    assetnum: str = Query(...),
    days: int = Query(90),
):
    """Maintenance history for a vehicle from tra_prod_zz_trainstatus."""
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT assetnum,
                       dynamicstatus,
                       actstart,
                       actfinish,
                       worktype,
                       description,
                       deptid,
                       zz_wojp3
                FROM   tra_prod_zz_trainstatus
                WHERE  assetnum = $1
                  AND  worktype IS NOT NULL
                  AND  actstart::date >= CURRENT_DATE - make_interval(days => $2)
                ORDER  BY actstart::date DESC
                """,
                assetnum,
                days,
            )

        data = []
        for r in rows:
            wt = r["worktype"] or ""
            ds = r["dynamicstatus"] or ""
            ds_info = DYNAMIC_STATUS_MAP.get(ds, {"status": "repair", "label": ds or "不可用", "color": "red"})

            # Calculate duration if both start and finish exist
            duration_hrs = None
            if r["actstart"] and r["actfinish"]:
                try:
                    start = datetime.fromisoformat(r["actstart"])
                    finish = datetime.fromisoformat(r["actfinish"])
                    duration_hrs = round((finish - start).total_seconds() / 3600, 1)
                except (ValueError, TypeError):
                    pass

            # Truncate ISO datetime to date only
            raw_start = r["actstart"] or ""
            dt_start = raw_start.split("T")[0] if "T" in raw_start else raw_start
            raw_end = r["actfinish"] or ""
            dt_end = raw_end.split("T")[0] if "T" in raw_end else raw_end

            # Map dynamicstatus to frontend-compatible status code
            status_code = "COMP" if ds in ("70", "20", "10") else "INPRG"

            data.append(
                {
                    "assetnum": r["assetnum"],
                    "wonum": r["zz_wojp3"] or "",
                    "date": dt_start,
                    "endDate": dt_end,
                    "type": wt,
                    "typeLabel": WORKTYPE_MAP.get(wt, wt),
                    "worktype": wt,
                    "worktypeLabel": WORKTYPE_MAP.get(wt, wt),
                    "status": status_code,
                    "dynamicstatus": ds,
                    "statusLabel": ds_info["label"],
                    "statusColor": ds_info["color"],
                    "description": r["description"] or "",
                    "depot": r["deptid"] or "",
                    "depotName": DEPOT_NAMES.get(r["deptid"] or "", r["deptid"] or ""),
                    "durationHours": duration_hrs,
                }
            )

        return {
            "data": data,
            "meta": {"total": len(data), "days": days, "generatedAt": _now_iso()},
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 8. GET /api/v1/fault-history
# ---------------------------------------------------------------------------

URGENCY_MAP = {
    "A": {"severity": "high", "label": "行車事故"},
    "B": {"severity": "medium", "label": "虛驚事故"},
    "C": {"severity": "low", "label": "一般故障"},
}

SR_STATUS_MAP = {
    "立案": "OPEN",
    "處理中": "INPROG",
    "處理完成": "COMP",
    "結案": "CLOSE",
    "併單": "MERGED",
    "取消": "CAN",
    "退件": "REJECT",
}


@app.get("/api/v1/fault-history")
async def get_fault_history(
    assetnum: str = Query(...),
    days: int = Query(180),
):
    """Failure report history from tra_prod_mxsr.

    Queries by zz_eq24 = assetnum directly, and also by any member car
    whose zz_cargroup matches (for car-group assets like EMU).
    """
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT sr.zz_imnum, sr.zz_entrydate, sr.description,
                       sr.zz_urgency, sr.status, sr.status_description,
                       sr.zz_eq24, sr.plusalocation, sr.plusaflightnum
                FROM   tra_prod_mxsr sr
                WHERE  (sr.zz_eq24 = $1
                        OR sr.zz_eq24 IN (
                            SELECT assetnum FROM tra_prod_mxasset
                            WHERE zz_cargroup = $1
                        ))
                  AND  sr.zz_entrydate::date >= CURRENT_DATE - make_interval(days => $2)
                ORDER  BY sr.statusdate DESC
                """,
                assetnum,
                days,
            )

        data = []
        by_severity = {"high": 0, "medium": 0, "low": 0}
        for r in rows:
            urg = r["zz_urgency"] or "C"
            urg_info = URGENCY_MAP.get(urg, URGENCY_MAP["C"])
            sev = urg_info["severity"]
            by_severity[sev] = by_severity.get(sev, 0) + 1

            entry_date = r["zz_entrydate"] or ""
            dt = entry_date.split("T")[0] if "T" in entry_date else entry_date

            status_raw = r["status"] or ""
            status_code = SR_STATUS_MAP.get(status_raw, status_raw)

            data.append(
                {
                    "failureCode": r["zz_imnum"] or "",
                    "date": dt,
                    "description": (r["description"] or "").strip(),
                    "severity": sev,
                    "severityLabel": urg_info["label"],
                    "status": status_code,
                    "statusLabel": r["status_description"] or status_raw,
                    "vehicle": r["zz_eq24"] or "",
                    "location": r["plusalocation"] or "",
                    "trainNo": r["plusaflightnum"] or "",
                }
            )

        return {
            "data": data,
            "meta": {
                "total": len(data),
                "days": days,
                "bySeverity": by_severity,
                "generatedAt": _now_iso(),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ---------------------------------------------------------------------------
# 9. GET /api/v1/vehicle-kpi  (MOCK)
# ---------------------------------------------------------------------------
@app.get("/api/v1/vehicle-kpi")
async def get_vehicle_kpi(
    assetnum: str = Query(...),
    period: int = Query(365),
):
    """KPI metrics (MTBF, MDBF, MTTR) for a vehicle. Currently returns mock data."""
    return {
        "data": {
            "assetnum": assetnum,
            "period": period,
            "calculatedAt": _now_iso(),
            "mtbf": {
                "value": 680,
                "unit": "hours",
                "benchmark": 720,
                "pct": 94,
                "grade": "green",
                "trend": "up",
                "trendPct": 5,
                "faultCount": 3,
                "faultDates": ["2026-02-15", "2026-01-20", "2025-12-05"],
            },
            "mdbf": {
                "value": 45000,
                "displayValue": "45k",
                "unit": "km",
                "benchmark": 50000,
                "pct": 90,
                "grade": "green",
                "trend": "up",
                "trendPct": 3,
                "yearlyKm": 135000,
                "faultCount": 3,
            },
            "mttr": {
                "value": 3.5,
                "unit": "hours",
                "target": 4.0,
                "pct": 85,
                "grade": "green",
                "trend": "down",
                "trendPct": 8,
                "repairCount": 12,
                "avgRepairHours": 3.5,
            },
        },
        "mock": True,
    }


# ---------------------------------------------------------------------------
# 10. POST /api/v1/dynamic-report  (MOCK)
# ---------------------------------------------------------------------------
@app.post("/api/v1/dynamic-report")
async def create_dynamic_report(request: Request):
    """Create a dynamic report. Currently returns mock success response."""
    try:
        body = await request.json()
    except Exception:
        body = {}

    assetnum = body.get("assetnum", "")
    if not assetnum:
        raise HTTPException(status_code=400, detail="assetnum is required")

    now = datetime.utcnow()
    return {
        "data": {
            "reportId": f"RPT-{now.strftime('%Y%m%d%H%M%S')}",
            "assetnum": assetnum,
            "status": "submitted",
            "createdAt": now.isoformat() + "Z",
            "description": body.get("description", ""),
        },
        "mock": True,
    }


# ---------------------------------------------------------------------------
# 11. GET /api/v1/train-tracking
# ---------------------------------------------------------------------------
@app.get("/api/v1/train-tracking")
async def get_train_tracking(
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    vehicle: Optional[str] = Query(None, description="Vehicle group ID (e.g. EP941)"),
    depot: Optional[str] = Query(None, description="Depot code filter"),
):
    """Train tracking data for map display.

    Returns vehicle groups with their scheduled legs (train segments),
    including departure/arrival times, stations, and mileage.
    Used by train-map.html to draw routes and estimate positions.

    Query: tra_prod_zz_trainstatement grouped by trainsgrpid.
    Time fields use 1970-01-01 as date base — we extract HH:MM only.
    """
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            # Build query with optional filters
            conditions = ["trainstatement_date LIKE $1 || '%'"]
            params: list = [date]
            idx = 2

            if vehicle:
                conditions.append(f"trainsgrpid = ${idx}")
                params.append(vehicle)
                idx += 1

            if depot:
                conditions.append(f"deptid = ${idx}")
                params.append(depot)
                idx += 1

            where_clause = " AND ".join(conditions)

            rows = await conn.fetch(
                f"""
                SELECT trainsgrpid, deptid, planid,
                       trainsno, trainsseq, mileage,
                       trainsno_s_time, trainsno_e_time,
                       from_station, to_station
                FROM   tra_prod_zz_trainstatement
                WHERE  {where_clause}
                ORDER  BY trainsgrpid, trainsseq::int
                """,
                *params,
            )

            # Also fetch car lines for type detection
            grpids = list({r["trainsgrpid"] for r in rows if r["trainsgrpid"]})

            asset_type_map: dict[str, Optional[str]] = {}
            if grpids:
                line_rows = await conn.fetch(
                    """
                    SELECT DISTINCT l.trainsgrpid, l.assetnum,
                           COALESCE(g.eq3, a.eq3) AS resolved_eq3
                    FROM   tra_prod_zz_trainstatement_zz_trainstatementline l
                    LEFT JOIN tra_prod_mxasset a ON a.assetnum = l.assetnum
                    LEFT JOIN tra_prod_mxasset g
                           ON g.assetnum = a.zz_cargroup
                          AND g.eq9 LIKE '%組%'
                    WHERE  l.trainsgrpid = ANY($1)
                    """,
                    grpids,
                )
                # Map grpid → vehicle type (first resolved type wins)
                grp_type_map: dict[str, Optional[str]] = {}
                for lr in line_rows:
                    gid = lr["trainsgrpid"]
                    if gid not in grp_type_map or not grp_type_map[gid]:
                        eq3 = lr["resolved_eq3"] or ""
                        grp_type_map[gid] = get_vehicle_type(eq3)
                asset_type_map = grp_type_map

        # Group by trainsgrpid
        groups: dict[str, dict] = {}
        for r in rows:
            grp_id = r["trainsgrpid"] or ""
            if not grp_id:
                continue

            leg = {
                "trainNo": r["trainsno"] or "",
                "seq": int(r["trainsseq"]) if r["trainsseq"] else 0,
                "from": r["from_station"] or "",
                "to": r["to_station"] or "",
                "departTime": _extract_time(r["trainsno_s_time"]),
                "arriveTime": _extract_time(r["trainsno_e_time"]),
                "mileage": round(float(r["mileage"]), 1) if r["mileage"] else 0,
            }

            if grp_id not in groups:
                groups[grp_id] = {
                    "vehicleId": grp_id,
                    "depot": DEPOT_NAMES.get(r["deptid"] or "", r["deptid"] or ""),
                    "depotCode": r["deptid"] or "",
                    "planId": r["planid"] or "",
                    "type": asset_type_map.get(grp_id) or "emu",
                    "legs": [],
                    "totalMileage": 0,
                }

            groups[grp_id]["legs"].append(leg)
            groups[grp_id]["totalMileage"] += leg["mileage"]

        # Round total mileage
        vehicles = list(groups.values())
        for v in vehicles:
            v["totalMileage"] = round(v["totalMileage"], 1)

        return {
            "data": {
                "date": date,
                "vehicles": vehicles,
            },
            "meta": {
                "total": len(vehicles),
                "generatedAt": _now_iso(),
            },
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
