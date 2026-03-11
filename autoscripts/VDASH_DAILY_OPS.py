# -*- coding: utf-8 -*-
"""
VDASH_DAILY_OPS — 當日運用明細
Maximo Automation Script (Jython)

GET /api/v1/daily-ops?depot=MGY00&date=2026-02-24&type=all
回傳指定段指定日的所有車輛運用工單

MBO: WORKORDER + ASSET + METERREADING
自訂欄位: TRA_CTRLMODE, TRA_OPCODE, TRA_MACODE, TRA_TRAINSET
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date
from java.text import SimpleDateFormat
import json as jsonmod

try:
    # ── 參數解析 ──
    depot = request.getQueryParam("depot")
    dateStr = request.getQueryParam("date")
    typeFilter = request.getQueryParam("type") or "all"

    if not depot:
        error = JSONObject()
        error.put("code", "bad_request")
        error.put("message", u"缺少必要參數: depot")
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(400)
        raise Exception("stop")

    sdf = SimpleDateFormat("yyyy-MM-dd")
    sdfTime = SimpleDateFormat("HH:mm")
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")
    targetDate = sdf.parse(dateStr) if dateStr else Date()
    targetDateStr = sdf.format(targetDate)

    TYPE_LABELS = {
        'e': u'電力機車', 'emu': u'電聯車', 'dr': u'柴油客車'
    }
    CTRL_LABELS = {
        'A': u'主控', 'B': u'被控', 'C': u'輔助'
    }

    # ── 查詢當日運用工單 ──
    whereClause = (
        "worktype = 'OPS' "
        "and status in ('APPR','INPRG','COMP') "
        "and date(schedstart) = '%s' "
        "and siteid = 'TRA' "
        "and assetnum in (select assetnum from asset where location = '%s' and siteid = 'TRA')"
        % (targetDateStr, depot)
    )

    woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    woSet.setWhere(whereClause)
    woSet.setOrderBy("assetnum")
    woSet.reset()

    vehicles = JSONArray()
    total = 0

    wo = woSet.moveFirst()
    while wo is not None:
        assetnum = wo.getString("ASSETNUM")

        # 判斷車型
        if assetnum.startswith("EMU"):
            vtype = "emu"
        elif assetnum.startswith("DR"):
            vtype = "dr"
        else:
            vtype = "e"

        # 車型篩選
        if typeFilter != "all" and vtype != typeFilter:
            wo = woSet.moveNext()
            continue

        ctrl = wo.getString("TRA_CTRLMODE") or "A"
        opCode = wo.getString("TRA_OPCODE") or ""
        ma = wo.getString("TRA_MACODE") or ""
        trainSetRaw = wo.getString("TRA_TRAINSET") or "[]"

        # 解析 trains（JSON 陣列或逗號分隔）
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

        # 起訖時間
        schedStart = wo.getDate("SCHEDSTART")
        schedFinish = wo.getDate("SCHEDFINISH")
        startTime = sdfTime.format(schedStart) if schedStart else ""
        endTime = sdfTime.format(schedFinish) if schedFinish else ""

        # 里程
        mrSet = MXServer.getMXServer().getMboSet("METERREADING", userInfo)
        mrSet.setWhere(
            "assetnum = '%s' and metername = 'KM_DAILY' "
            "and readingdate = '%s' and siteid = 'TRA'"
            % (assetnum, targetDateStr)
        )
        mr = mrSet.moveFirst()
        mileage = mr.getDouble("READING") if mr else 0.0

        # 組裝車輛物件
        vObj = JSONObject()
        vObj.put("id", assetnum)
        vObj.put("type", vtype)
        vObj.put("typeLabel", TYPE_LABELS.get(vtype, vtype))
        vObj.put("ctrl", ctrl)
        vObj.put("ctrlLabel", CTRL_LABELS.get(ctrl, ctrl))
        vObj.put("opCode", opCode)
        vObj.put("ma", ma)
        vObj.put("trains", trains)
        vObj.put("start", startTime)
        vObj.put("end", endTime)
        vObj.put("mileage", round(mileage, 1))
        vObj.put("status", "operating")

        # startTrain / endTrain
        if trains.size() > 0:
            vObj.put("startTrain", trains.get(0))
            vObj.put("endTrain", trains.get(trains.size() - 1))
        else:
            vObj.put("startTrain", "")
            vObj.put("endTrain", "")

        vehicles.add(vObj)
        total += 1
        wo = woSet.moveNext()

    # ── 組裝回應 ──
    data = JSONObject()
    data.put("date", targetDateStr)
    data.put("depot", depot)
    data.put("vehicles", vehicles)

    meta = JSONObject()
    meta.put("total", total)
    meta.put("filtered", total)
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
