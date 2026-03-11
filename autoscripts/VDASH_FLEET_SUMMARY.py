# -*- coding: utf-8 -*-
"""
VDASH_FLEET_SUMMARY — 艦隊摘要
Maximo Automation Script (Jython)

GET /api/v1/fleet-summary?depot=MGY00&date=2026-02-24
回傳指定段指定日的車輛統計 + 里程彙總

MBO: ASSET + METERREADING
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date, Calendar
from java.text import SimpleDateFormat

try:
    # ── 參數解析 ──
    depot = request.getQueryParam("depot")
    dateStr = request.getQueryParam("date")

    if not depot:
        error = JSONObject()
        error.put("code", "bad_request")
        error.put("message", "缺少必要參數: depot")
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(400)
        raise Exception("stop")

    sdf = SimpleDateFormat("yyyy-MM-dd")
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")
    targetDate = sdf.parse(dateStr) if dateStr else Date()
    targetDateStr = sdf.format(targetDate)

    # ── 查詢該段所有車輛 ──
    assetSet = MXServer.getMXServer().getMboSet("ASSET", userInfo)
    assetSet.setWhere("location = '%s' and siteid = 'TRA' and status != 'DECOMMISSIONED'" % depot)
    assetSet.setOrderBy("assetnum")
    assetSet.reset()

    # 統計變數
    TYPE_MAP = {
        'E': 'e', 'EMU': 'emu', 'DR': 'dr'
    }
    TYPE_LABELS = {
        'e': u'電力機車', 'emu': u'電聯車', 'dr': u'柴油客車'
    }

    byTypeData = {}  # type -> { count, active, totalMileage }
    totalVehicles = 0
    activeVehicles = 0
    totalMileage = 0.0

    asset = assetSet.moveFirst()
    while asset is not None:
        assetnum = asset.getString("ASSETNUM")
        vtype = asset.getString("TRA_VTYPE") or ""
        status = asset.getString("STATUS")

        # 判斷車型
        if not vtype:
            if assetnum.startswith("EMU"):
                vtype = "emu"
            elif assetnum.startswith("DR"):
                vtype = "dr"
            else:
                vtype = "e"

        if vtype not in byTypeData:
            byTypeData[vtype] = {
                "count": 0, "active": 0, "totalMileage": 0.0
            }

        byTypeData[vtype]["count"] += 1
        totalVehicles += 1

        if status in ("OPERATING", "ACTIVE"):
            byTypeData[vtype]["active"] += 1
            activeVehicles += 1

        # 查詢當日里程
        mrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
        mrSet.setWhere(
            "assetnum = '%s' and metername = 'KM_DAILY' "
            "and readingdate = '%s' and siteid = 'TRA'"
            % (assetnum, targetDateStr)
        )
        mr = mrSet.moveFirst()
        if mr is not None:
            km = mr.getDouble("READING")
            byTypeData[vtype]["totalMileage"] += km
            totalMileage += km

        asset = assetSet.moveNext()

    # ── 查詢段名 ──
    locSet = MXServer.getMXServer().getMboSet("LOCATIONS", userInfo)
    locSet.setWhere("location = '%s' and siteid = 'TRA'" % depot)
    locMbo = locSet.moveFirst()
    depotName = locMbo.getString("DESCRIPTION") if locMbo else depot

    # ── 組裝 byType 陣列 ──
    byTypeArr = JSONArray()
    for vtype in ["e", "emu", "dr"]:
        if vtype not in byTypeData:
            continue
        d = byTypeData[vtype]
        obj = JSONObject()
        obj.put("type", vtype)
        obj.put("typeLabel", TYPE_LABELS.get(vtype, vtype))
        obj.put("count", d["count"])
        obj.put("active", d["active"])
        obj.put("totalMileage", round(d["totalMileage"], 1))
        avgMileage = round(d["totalMileage"] / d["active"], 1) if d["active"] > 0 else 0.0
        obj.put("avgMileage", avgMileage)
        byTypeArr.add(obj)

    # ── 組裝回應 ──
    depotObj = JSONObject()
    depotObj.put("code", depot)
    depotObj.put("name", depotName)

    summaryObj = JSONObject()
    summaryObj.put("totalVehicles", totalVehicles)
    summaryObj.put("activeVehicles", activeVehicles)
    summaryObj.put("totalMileage", round(totalMileage, 1))
    avgPerVehicle = round(totalMileage / activeVehicles, 1) if activeVehicles > 0 else 0.0
    summaryObj.put("avgMileagePerVehicle", avgPerVehicle)

    data = JSONObject()
    data.put("depot", depotObj)
    data.put("date", targetDateStr)
    data.put("summary", summaryObj)
    data.put("byType", byTypeArr)

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
