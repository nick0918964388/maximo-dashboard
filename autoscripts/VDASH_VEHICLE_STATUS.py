# -*- coding: utf-8 -*-
"""
VDASH_VEHICLE_STATUS — 全車狀態總覽
Maximo Automation Script (Jython)

GET /api/v1/vehicle-status?type=all&depot=all
回傳所有車輛的健康狀態（交通燈看板）

MBO: ASSET + WORKORDER (active)
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date
from java.text import SimpleDateFormat

# 狀態映射：Maximo ASSET.STATUS → Dashboard
STATUS_MAP = {
    'OPERATING':     {'status': 'available',     'color': 'green',  'label': u'可用'},
    'ACTIVE':        {'status': 'available',     'color': 'green',  'label': u'可用'},
    'NOT READY':     {'status': 'repair',        'color': 'red',    'label': u'檢修'},
    'BROKEN':        {'status': 'repair',        'color': 'red',    'label': u'檢修'},
    'MISSING PARTS': {'status': 'parts',         'color': 'red',    'label': u'待料'},
    'IN TRANSIT':    {'status': 'transit',        'color': 'yellow', 'label': u'回送中'},
    'DECOMMISSIONED':{'status': 'decommission',  'color': 'red',    'label': u'待報廢'},
}

TYPE_LABELS = {
    'e': u'電力機車', 'emu': u'電聯車', 'dr': u'柴油客車'
}

try:
    sdf = SimpleDateFormat("yyyy-MM-dd")
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")

    typeFilter = request.getQueryParam("type") or "all"
    depotFilter = request.getQueryParam("depot") or "all"

    # ── 查詢車輛 ──
    whereClause = "siteid = 'TRA' and status != 'DECOMMISSIONED'"
    if depotFilter != "all":
        whereClause += " and location = '%s'" % depotFilter

    assetSet = MXServer.getMXServer().getMboSet("ASSET", userInfo)
    assetSet.setWhere(whereClause)
    assetSet.setOrderBy("assetnum")
    assetSet.reset()

    # 按車型分組
    byTypeMap = {}  # type -> { type, typeLabel, total, green, yellow, red, vehicles }

    asset = assetSet.moveFirst()
    while asset is not None:
        assetnum = asset.getString("ASSETNUM")
        assetStatus = asset.getString("STATUS")
        location = asset.getString("LOCATION")

        # 判斷車型
        vtype = asset.getString("TRA_VTYPE") or ""
        if not vtype:
            if assetnum.startswith("EMU"):
                vtype = "emu"
            elif assetnum.startswith("DR"):
                vtype = "dr"
            else:
                vtype = "e"

        # 車型篩選
        if typeFilter != "all" and vtype != typeFilter:
            asset = assetSet.moveNext()
            continue

        # 映射狀態
        mapped = STATUS_MAP.get(assetStatus, {'status': 'unknown', 'color': 'yellow', 'label': assetStatus})

        # 取得段名
        locSet = MXServer.getMXServer().getMboSet("LOCATIONS", userInfo)
        locSet.setWhere("location = '%s' and siteid = 'TRA'" % location)
        locMbo = locSet.moveFirst()
        depotName = locMbo.getString("DESCRIPTION") if locMbo else location

        # 建立車輛物件
        vObj = JSONObject()
        vObj.put("id", assetnum)
        vObj.put("status", mapped["status"])
        vObj.put("statusLabel", mapped["label"])
        vObj.put("statusColor", mapped["color"])
        vObj.put("depot", location)
        vObj.put("depotName", depotName)

        # 若非綠色，取得描述和 ETA
        if mapped["color"] != "green":
            # 查詢進行中的維修工單
            woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
            woSet.setWhere(
                "assetnum = '%s' and status in ('APPR','INPRG','WMATL') and siteid = 'TRA'"
                % assetnum
            )
            woSet.setOrderBy("schedfinish desc")
            wo = woSet.moveFirst()
            if wo is not None:
                desc = wo.getString("DESCRIPTION")
                eta = wo.getDate("SCHEDFINISH")
                vObj.put("statusDesc", desc or "")
                vObj.put("wonum", wo.getString("WONUM"))
                if eta:
                    vObj.put("eta", sdf.format(eta))

        # 加入分組
        if vtype not in byTypeMap:
            byTypeMap[vtype] = {
                "type": vtype,
                "typeLabel": TYPE_LABELS.get(vtype, vtype),
                "total": 0,
                "green": 0,
                "yellow": 0,
                "red": 0,
                "vehicles": JSONArray()
            }

        group = byTypeMap[vtype]
        group["total"] += 1
        group[mapped["color"]] += 1
        group["vehicles"].add(vObj)

        asset = assetSet.moveNext()

    # ── 組裝 summary ──
    totalAll = sum(g["total"] for g in byTypeMap.values())
    greenAll = sum(g["green"] for g in byTypeMap.values())
    yellowAll = sum(g["yellow"] for g in byTypeMap.values())
    redAll = sum(g["red"] for g in byTypeMap.values())

    summaryObj = JSONObject()
    summaryObj.put("total", totalAll)
    summaryObj.put("green", greenAll)
    summaryObj.put("yellow", yellowAll)
    summaryObj.put("red", redAll)

    # ── 組裝 byType ──
    byTypeArr = JSONArray()
    for vtype in ["e", "emu", "dr"]:
        if vtype not in byTypeMap:
            continue
        g = byTypeMap[vtype]
        obj = JSONObject()
        obj.put("type", g["type"])
        obj.put("typeLabel", g["typeLabel"])
        obj.put("total", g["total"])
        obj.put("green", g["green"])
        obj.put("yellow", g["yellow"])
        obj.put("red", g["red"])
        obj.put("vehicles", g["vehicles"])
        byTypeArr.add(obj)

    # ── 回應 ──
    data = JSONObject()
    data.put("summary", summaryObj)
    data.put("byType", byTypeArr)

    meta = JSONObject()
    meta.put("generatedAt", sdfISO.format(Date()))

    resp = JSONObject()
    resp.put("data", data)
    resp.put("meta", meta)
    responseBody = resp.serialize(True)

except Exception as e:
    error = JSONObject()
    error.put("code", "maximo_error")
    error.put("message", str(e))
    resp = JSONObject()
    resp.put("error", error)
    responseBody = resp.serialize(True)
    request.getHttpServletResponse().setStatus(500)
