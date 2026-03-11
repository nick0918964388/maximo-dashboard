# -*- coding: utf-8 -*-
"""
VDASH_MAINT_HISTORY — 保養維修紀錄
Maximo Automation Script (Jython)

GET /api/v1/maint-history?assetnum=E315&days=90
回傳車輛近期保養/維修工單紀錄

MBO: WORKORDER (worktype IN PM, CM, EM)
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date, Calendar
from java.text import SimpleDateFormat

# 工單類型標籤
WORKTYPE_LABELS = {
    'PM': u'定期保養',
    'CM': u'矯正維修',
    'EM': u'緊急維修',
}

# 工單狀態標籤
STATUS_LABELS = {
    'COMP': u'已完成',
    'INPRG': u'進行中',
    'APPR': u'已排程',
    'WMATL': u'待料',
    'CLOSE': u'已結案',
    'CAN': u'已取消',
}

try:
    # ── 參數解析 ──
    assetnum = request.getQueryParam("assetnum")
    daysParam = request.getQueryParam("days")
    days = int(daysParam) if daysParam else 90

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

    # 計算起始日期
    cal = Calendar.getInstance()
    cal.add(Calendar.DAY_OF_YEAR, -days)
    startDate = sdf.format(cal.getTime())

    # ── 查詢保養/維修工單 ──
    woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    woSet.setWhere(
        "assetnum = '%s' "
        "and worktype in ('PM','CM','EM') "
        "and schedstart >= '%s' "
        "and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    woSet.setOrderBy("schedstart desc")
    woSet.reset()

    items = JSONArray()
    total = 0
    wo = woSet.moveFirst()

    while wo is not None:
        worktype = wo.getString("WORKTYPE")
        status = wo.getString("STATUS")
        schedStart = wo.getDate("SCHEDSTART")
        actLabHrs = wo.getDouble("ACTLABHRS")

        obj = JSONObject()
        obj.put("wonum", wo.getString("WONUM"))
        obj.put("date", sdf.format(schedStart) if schedStart else "")
        obj.put("type", worktype)
        obj.put("typeLabel", WORKTYPE_LABELS.get(worktype, worktype))
        obj.put("description", wo.getString("DESCRIPTION") or "")
        obj.put("status", status)
        obj.put("statusLabel", STATUS_LABELS.get(status, status))
        obj.put("duration", round(actLabHrs, 1) if actLabHrs > 0 else None)

        items.add(obj)
        total += 1
        wo = woSet.moveNext()

    # ── 組裝回應 ──
    meta = JSONObject()
    meta.put("total", total)
    meta.put("days", days)

    resp = JSONObject()
    resp.put("data", items)
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
