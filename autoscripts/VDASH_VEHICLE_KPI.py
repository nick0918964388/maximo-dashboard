# -*- coding: utf-8 -*-
"""
VDASH_VEHICLE_KPI — 維修可靠度 KPI
Maximo Automation Script (Jython)

GET /api/v1/vehicle-kpi?assetnum=E315&period=365
回傳 MTBF / MDBF / MTTR 三大維修可靠度指標

MBO: FAILUREREPORT + METERREADING + WORKORDER
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date, Calendar
from java.text import SimpleDateFormat

def iterate_mboset(mboSet):
    """Helper: iterate over an MboSet"""
    results = []
    mbo = mboSet.moveFirst()
    while mbo is not None:
        results.append(mbo)
        mbo = mboSet.moveNext()
    return results


def calculate_mtbf(assetnum, period_days, startDate, sdf):
    """MTBF = 平均故障間隔時間 (hours)"""
    frSet = MXServer.getMXServer().getMboSet("FAILUREREPORT", userInfo)
    frSet.setWhere(
        "assetnum = '%s' and reportdate >= '%s' and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    frSet.setOrderBy("reportdate asc")
    frSet.reset()

    fault_dates = []
    fr = frSet.moveFirst()
    while fr is not None:
        d = fr.getDate("REPORTDATE")
        if d:
            fault_dates.append(d)
        fr = frSet.moveNext()

    fault_count = len(fault_dates)
    benchmark = 720  # 30 days in hours

    if fault_count < 2:
        return {
            "value": 0, "unit": "hours", "benchmark": benchmark,
            "pct": 100 if fault_count == 0 else 50,
            "grade": "green" if fault_count == 0 else "yellow",
            "trend": "flat", "trendPct": 0,
            "faultCount": fault_count
        }

    # 計算故障間隔
    total_gap_ms = 0
    for i in range(1, len(fault_dates)):
        gap_ms = abs(fault_dates[i].getTime() - fault_dates[i - 1].getTime())
        total_gap_ms += gap_ms

    avg_gap_hours = (total_gap_ms / (fault_count - 1)) / (1000.0 * 3600)
    mtbf_hours = int(round(avg_gap_hours))

    pct = min(int(round(float(mtbf_hours) / benchmark * 100)), 100)
    if pct >= 80:
        grade = "green"
    elif pct >= 50:
        grade = "yellow"
    else:
        grade = "red"

    return {
        "value": mtbf_hours, "unit": "hours", "benchmark": benchmark,
        "pct": pct, "grade": grade,
        "trend": "flat", "trendPct": 0,
        "faultCount": fault_count
    }


def calculate_mdbf(assetnum, period_days, startDate, sdf):
    """MDBF = 平均故障間隔里程 (km)"""
    # 里程合計
    mrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
    mrSet.setWhere(
        "assetnum = '%s' and metername = 'KM_DAILY' "
        "and readingdate >= '%s' and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    mrSet.reset()
    total_km = 0.0
    mr = mrSet.moveFirst()
    while mr is not None:
        total_km += mr.getDouble("READING")
        mr = mrSet.moveNext()

    # 故障次數
    frSet = MXServer.getMXServer().getMboSet("FAILUREREPORT", userInfo)
    frSet.setWhere(
        "assetnum = '%s' and reportdate >= '%s' and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    fault_count = frSet.count()

    benchmark = 50000  # 50,000 km

    if fault_count == 0:
        return {
            "value": 0, "displayValue": "0", "unit": "km",
            "benchmark": benchmark, "pct": 100,
            "grade": "green", "trend": "flat", "trendPct": 0,
            "yearlyKm": int(round(total_km)), "faultCount": 0
        }

    mdbf = total_km / fault_count
    pct = min(int(round(mdbf / benchmark * 100)), 100)

    if pct >= 75:
        grade = "green"
    elif pct >= 45:
        grade = "yellow"
    else:
        grade = "red"

    # 格式化顯示值
    mdbf_rounded = int(round(mdbf))
    if mdbf_rounded >= 1000:
        displayValue = "%.1fk" % (mdbf_rounded / 1000.0)
    else:
        displayValue = str(mdbf_rounded)

    return {
        "value": mdbf_rounded, "displayValue": displayValue, "unit": "km",
        "benchmark": benchmark, "pct": pct,
        "grade": grade, "trend": "flat", "trendPct": 0,
        "yearlyKm": int(round(total_km)), "faultCount": fault_count
    }


def calculate_mttr(assetnum, period_days, startDate, sdf):
    """MTTR = 平均維修時間 (hours)"""
    woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    woSet.setWhere(
        "assetnum = '%s' and worktype in ('CM','EM') "
        "and status in ('COMP','CLOSE') "
        "and schedstart >= '%s' and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    woSet.reset()

    durations = []
    wo = woSet.moveFirst()
    while wo is not None:
        hrs = wo.getDouble("ACTLABHRS")
        if hrs > 0:
            durations.append(hrs)
        wo = woSet.moveNext()

    repair_count = len(durations)
    target = 4.0

    if repair_count == 0:
        return {
            "value": 0, "unit": "hours", "target": target,
            "pct": 100, "grade": "green",
            "trend": "flat", "trendPct": 0,
            "repairCount": 0, "avgRepairHours": 0
        }

    avg_hours = sum(durations) / repair_count
    # 效率百分比：越低的 MTTR 越好
    efficiency = max(0, (1 - min(avg_hours, 8) / 8)) * 100

    if avg_hours <= 4:
        grade = "green"
    elif avg_hours <= 6:
        grade = "yellow"
    else:
        grade = "red"

    return {
        "value": round(avg_hours, 1), "unit": "hours", "target": target,
        "pct": int(round(efficiency)), "grade": grade,
        "trend": "flat", "trendPct": 0,
        "repairCount": repair_count,
        "avgRepairHours": round(avg_hours, 1)
    }


try:
    # ── 參數解析 ──
    assetnum = request.getQueryParam("assetnum")
    periodParam = request.getQueryParam("period")
    period = int(periodParam) if periodParam else 365

    if not assetnum:
        error = JSONObject()
        error.put("code", "bad_request")
        error.put("message", u"缺少必要參數: assetnum")
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(400)
        raise Exception("stop")

    sdf = SimpleDateFormat("yyyy-MM-dd")
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")

    cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, -period)
    startDate = sdf.format(cal.getTime())

    # ── 計算三大 KPI ──
    mtbf = calculate_mtbf(assetnum, period, startDate, sdf)
    mdbf = calculate_mdbf(assetnum, period, startDate, sdf)
    mttr = calculate_mttr(assetnum, period, startDate, sdf)

    # ── 組裝為 JSONObject ──
    def dict_to_json(d):
        obj = JSONObject()
        for k, v in d.items():
            if v is None:
                obj.put(k, None)
            else:
                obj.put(k, v)
        return obj

    data = JSONObject()
    data.put("assetnum", assetnum)
    data.put("period", period)
    data.put("calculatedAt", sdfISO.format(Date()))
    data.put("mtbf", dict_to_json(mtbf))
    data.put("mdbf", dict_to_json(mdbf))
    data.put("mttr", dict_to_json(mttr))

    resp = JSONObject()
    resp.put("data", data)
    responseBody = resp.serialize(True)

except Exception as e:
    if str(e) != "stop":
        error = JSONObject()
        error.put("code", "maximo_error")
        error.put("message", str(e))
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(500)
