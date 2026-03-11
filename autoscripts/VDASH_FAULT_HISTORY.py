# -*- coding: utf-8 -*-
"""
VDASH_FAULT_HISTORY — 故障紀錄
Maximo Automation Script (Jython)

GET /api/v1/fault-history?assetnum=E315&days=180
回傳車輛近期故障報告

MBO: FAILUREREPORT
自訂欄位: TRA_SEVERITY
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date, Calendar
from java.text import SimpleDateFormat

# 嚴重度映射
SEVERITY_MAP = {
    1: {'severity': 'high',   'label': u'高'},
    2: {'severity': 'medium', 'label': u'中'},
    3: {'severity': 'low',    'label': u'低'},
}

# 狀態標籤
STATUS_LABELS = {
    'OPEN': u'待處理',
    'INPRG': u'處理中',
    'RESOLVED': u'已修復',
    'CLOSE': u'已結案',
}

try:
    # ── 參數解析 ──
    assetnum = request.getQueryParam("assetnum")
    daysParam = request.getQueryParam("days")
    days = int(daysParam) if daysParam else 180

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

    # ── 查詢故障報告 ──
    frSet = MXServer.getMXServer().getMboSet("FAILUREREPORT", userInfo)
    frSet.setWhere(
        "assetnum = '%s' "
        "and reportdate >= '%s' "
        "and siteid = 'TRA'"
        % (assetnum, startDate)
    )
    frSet.setOrderBy("reportdate desc")
    frSet.reset()

    items = JSONArray()
    total = 0
    bySeverity = {'high': 0, 'medium': 0, 'low': 0}

    fr = frSet.moveFirst()
    while fr is not None:
        sevInt = fr.getInt("TRA_SEVERITY")
        sevInfo = SEVERITY_MAP.get(sevInt, {'severity': 'medium', 'label': u'中'})
        status = fr.getString("STATUS") or "OPEN"
        reportDate = fr.getDate("REPORTDATE")

        obj = JSONObject()
        obj.put("failureCode", fr.getString("FAILURECODE") or "")
        obj.put("date", sdf.format(reportDate) if reportDate else "")
        obj.put("description", fr.getString("DESCRIPTION") or "")
        obj.put("severity", sevInfo["severity"])
        obj.put("severityLabel", sevInfo["label"])
        obj.put("status", status)
        obj.put("statusLabel", STATUS_LABELS.get(status, status))

        items.add(obj)
        bySeverity[sevInfo["severity"]] += 1
        total += 1
        fr = frSet.moveNext()

    # ── 組裝回應 ──
    bySevObj = JSONObject()
    bySevObj.put("high", bySeverity["high"])
    bySevObj.put("medium", bySeverity["medium"])
    bySevObj.put("low", bySeverity["low"])

    meta = JSONObject()
    meta.put("total", total)
    meta.put("days", days)
    meta.put("bySeverity", bySevObj)

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
