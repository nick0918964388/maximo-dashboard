# -*- coding: utf-8 -*-
"""
VDASH_VEHICLE_DETAIL — 車輛基本資料 + 運用紀錄
Maximo Automation Script (Jython)

GET /api/v1/vehicle-detail?assetnum=E315&days=30
回傳車輛基本資料、里程統計、里程圖表數據、近期運用紀錄

MBO: ASSET + WORKORDER + METERREADING
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date, Calendar
from java.text import SimpleDateFormat
import json as jsonmod

try:
    # ── 參數解析 ──
    assetnum = request.getQueryParam("assetnum")
    daysParam = request.getQueryParam("days")
    days = int(daysParam) if daysParam else 30

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
    sdfTime = SimpleDateFormat("HH:mm")
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")

    # 計算起始日期
    cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, -days)
    startDate = sdf.format(cal.getTime())

    TYPE_LABELS = {'e': u'電力機車', 'emu': u'電聯車', 'dr': u'柴油客車'}
    STATUS_LABELS = {
        'OPERATING': u'運行中', 'ACTIVE': u'可用', 'NOT READY': u'檢修',
        'BROKEN': u'檢修', 'IN TRANSIT': u'回送中'
    }
    CTRL_LABELS = {'A': u'主控', 'B': u'被控', 'C': u'輔助'}

    # ══════════════════════════════════════════
    # 1. 車輛基本資料
    # ══════════════════════════════════════════
    assetSet = MXServer.getMXServer().getMboSet("ASSET", userInfo)
    assetSet.setWhere("assetnum = '%s' and siteid = 'TRA'" % assetnum)
    assetMbo = assetSet.moveFirst()

    if assetMbo is None:
        error = JSONObject()
        error.put("code", "asset_not_found")
        error.put("message", u"找不到車輛: %s" % assetnum)
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(404)
        raise Exception("stop")

    location = assetMbo.getString("LOCATION")
    assetStatus = assetMbo.getString("STATUS")
    vtype = assetMbo.getString("TRA_VTYPE") or ""
    if not vtype:
        if assetnum.startswith("EMU"):
            vtype = "emu"
        elif assetnum.startswith("DR"):
            vtype = "dr"
        else:
            vtype = "e"

    # 段名
    locSet = MXServer.getMXServer().getMboSet("LOCATIONS", userInfo)
    locSet.setWhere("location = '%s' and siteid = 'TRA'" % location)
    locMbo = locSet.moveFirst()
    depotName = locMbo.getString("DESCRIPTION") if locMbo else location

    # 最近一筆運用工單的 opCode / ma
    latestWo = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    latestWo.setWhere(
        "assetnum = '%s' and worktype = 'OPS' and siteid = 'TRA'" % assetnum
    )
    latestWo.setOrderBy("schedstart desc")
    lastWo = latestWo.moveFirst()
    opCode = lastWo.getString("TRA_OPCODE") if lastWo else ""
    ma = lastWo.getString("TRA_MACODE") if lastWo else ""

    assetObj = JSONObject()
    assetObj.put("id", assetnum)
    assetObj.put("type", vtype)
    assetObj.put("typeLabel", TYPE_LABELS.get(vtype, vtype))
    assetObj.put("depot", location)
    assetObj.put("depotName", depotName)
    assetObj.put("opCode", opCode)
    assetObj.put("ma", ma)
    assetObj.put("status", assetStatus.lower().replace(" ", "_"))
    assetObj.put("statusLabel", STATUS_LABELS.get(assetStatus, assetStatus))

    # ══════════════════════════════════════════
    # 2. 里程統計
    # ══════════════════════════════════════════
    mrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
    mrSet.setWhere(
        "assetnum = '%s' and metername = 'KM_DAILY' "
        "and readingdate >= '%s' and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    mrSet.setOrderBy("readingdate asc")
    mrSet.reset()

    chartData = JSONArray()
    totalKm = 0.0
    readingCount = 0
    mr = mrSet.moveFirst()
    while mr is not None:
        dateVal = mr.getDate("READINGDATE")
        km = mr.getDouble("READING")
        totalKm += km
        readingCount += 1
        pt = JSONObject()
        pt.put("date", sdf.format(dateVal))
        pt.put("km", round(km, 1))
        chartData.add(pt)
        mr = mrSet.moveNext()

    # 年度里程（近365天）
    yrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
    calYr = Calendar.getInstance()
    calYr.add(Calendar.DAY_OF_YEAR, -365)
    yrStart = sdf.format(calYr.getTime())
    yrSet.setWhere(
        "assetnum = '%s' and metername = 'KM_DAILY' "
        "and readingdate >= '%s' and siteid = 'TRA'"
        % (assetnum, yrStart)
    )
    yrTotal = 0.0
    yrMr = yrSet.moveFirst()
    while yrMr is not None:
        yrTotal += yrMr.getDouble("READING")
        yrMr = yrSet.moveNext()

    # 月度里程（近30天）
    cal30 = Calendar.getInstance()
    cal30.add(Calendar.DAY_OF_YEAR, -30)
    monthStart = sdf.format(cal30.getTime())
    moSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
    moSet.setWhere(
        "assetnum = '%s' and metername = 'KM_DAILY' "
        "and readingdate >= '%s' and siteid = 'TRA'"
        % (assetnum, monthStart)
    )
    moTotal = 0.0
    moCount = 0
    moMr = moSet.moveFirst()
    while moMr is not None:
        moTotal += moMr.getDouble("READING")
        moCount += 1
        moMr = moSet.moveNext()

    dailyAvg = round(moTotal / moCount, 1) if moCount > 0 else 0.0

    mileageObj = JSONObject()
    mileageObj.put("monthlyKm", round(moTotal))
    mileageObj.put("yearlyKm", round(yrTotal))
    mileageObj.put("dailyAvgKm", dailyAvg)

    # ══════════════════════════════════════════
    # 3. 運用紀錄
    # ══════════════════════════════════════════
    woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    woSet.setWhere(
        "assetnum = '%s' and worktype = 'OPS' "
        "and schedstart >= '%s' "
        "and status in ('APPR','INPRG','COMP') and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    woSet.setOrderBy("schedstart desc")
    woSet.reset()

    operations = JSONArray()
    opCount = 0
    wo = woSet.moveFirst()
    while wo is not None:
        schedStart = wo.getDate("SCHEDSTART")
        schedFinish = wo.getDate("SCHEDFINISH")
        ctrl = wo.getString("TRA_CTRLMODE") or "A"
        trainSetRaw = wo.getString("TRA_TRAINSET") or "[]"

        trains = JSONArray()
        try:
            parsed = jsonmod.loads(trainSetRaw)
            for t in parsed:
                trains.add(str(t))
        except:
            for t in trainSetRaw.split(","):
                t = t.strip()
                if t:
                    trains.add(t)

        # 當日里程
        woDate = sdf.format(schedStart) if schedStart else ""
        woMrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
        woMrSet.setWhere(
            "assetnum = '%s' and metername = 'KM_DAILY' and readingdate = '%s' and siteid = 'TRA'"
            % (assetnum, woDate)
        )
        woMr = woMrSet.moveFirst()
        woMileage = woMr.getDouble("READING") if woMr else 0.0

        opObj = JSONObject()
        opObj.put("date", woDate)
        opObj.put("opCode", wo.getString("TRA_OPCODE") or "")
        opObj.put("trains", trains)
        opObj.put("start", sdfTime.format(schedStart) if schedStart else "")
        opObj.put("end", sdfTime.format(schedFinish) if schedFinish else "")
        opObj.put("mileage", round(woMileage, 1))
        opObj.put("ctrl", ctrl)
        opObj.put("ctrlLabel", CTRL_LABELS.get(ctrl, ctrl))
        operations.add(opObj)
        opCount += 1

        wo = woSet.moveNext()

    # ── 組裝回應 ──
    data = JSONObject()
    data.put("asset", assetObj)
    data.put("mileage", mileageObj)
    data.put("mileageChart", chartData)
    data.put("operations", operations)

    meta = JSONObject()
    meta.put("days", days)
    meta.put("operationCount", opCount)
    meta.put("generatedAt", sdfISO.format(Date()))

    resp = JSONObject()
    resp.put("data", data)
    resp.put("meta", meta)
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
