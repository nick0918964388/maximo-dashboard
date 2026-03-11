# -*- coding: utf-8 -*-
"""
VDASH_DYNAMIC_REPORT — 開立動態回報
Maximo Automation Script (Jython)

POST /api/v1/dynamic-report
建立車輛狀態回報工單

MBO: WORKORDER (新增)
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject
from java.util import Date
from java.text import SimpleDateFormat

# 狀態碼 → Maximo 資產狀態
STATUS_CODE_MAP = {
    'repair':       'NOT READY',
    'parts':        'MISSING PARTS',
    'transit':      'IN TRANSIT',
    'decommission': 'DECOMMISSIONED',
}

try:
    sdfISO = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")

    # ── 解析 POST Body ──
    bodyStr = request.getBody() if hasattr(request, 'getBody') else ""
    if not bodyStr:
        error = JSONObject()
        error.put("code", "bad_request")
        error.put("message", u"請求內容為空")
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(400)
        raise Exception("stop")

    body = JSONObject.parse(bodyStr)
    assetnum = body.get("assetnum")
    statusCode = body.get("statusCode")
    startTime = body.get("startTime")
    endTime = body.get("endTime")
    remarks = body.get("remarks") or ""

    # ── 驗證必填欄位 ──
    errors = []
    if not assetnum:
        errors.append({"field": "assetnum", "message": u"車輛編號為必填", "code": "required"})
    if not statusCode:
        errors.append({"field": "statusCode", "message": u"狀態碼為必填", "code": "required"})
    elif statusCode not in STATUS_CODE_MAP:
        errors.append({"field": "statusCode", "message": u"無效的狀態碼", "code": "invalid_enum"})

    if errors:
        from com.ibm.json.java import JSONArray
        errArr = JSONArray()
        for e in errors:
            errObj = JSONObject()
            errObj.put("field", e["field"])
            errObj.put("message", e["message"])
            errObj.put("code", e["code"])
            errArr.add(errObj)

        error = JSONObject()
        error.put("code", "validation_error")
        error.put("message", u"欄位驗證失敗")
        error.put("details", errArr)
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(422)
        raise Exception("stop")

    # ── 驗證車輛存在 ──
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

    # ── 建立動態回報工單 ──
    woSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
    newWo = woSet.add()

    newWo.setValue("SITEID", "TRA", MboConstants.NOACCESSCHECK)
    newWo.setValue("ASSETNUM", assetnum, MboConstants.NOACCESSCHECK)
    newWo.setValue("WORKTYPE", "DR", MboConstants.NOACCESSCHECK)  # Dynamic Report
    newWo.setValue("DESCRIPTION", u"動態回報 — %s — %s" % (assetnum, remarks or statusCode),
                   MboConstants.NOACCESSCHECK)

    # 設定起訖時間
    if startTime:
        newWo.setValue("SCHEDSTART", sdfISO.parse(startTime), MboConstants.NOACCESSCHECK)
    if endTime:
        newWo.setValue("SCHEDFINISH", sdfISO.parse(endTime), MboConstants.NOACCESSCHECK)

    # 備註
    if remarks:
        longDescSet = newWo.getMboSet("LONGDESCRIPTION")
        if longDescSet:
            longDesc = longDescSet.add()
            longDesc.setValue("LDTEXT", remarks, MboConstants.NOACCESSCHECK)

    # 狀態設為 APPR (已核准)
    newWo.changeStatus("APPR", Date(), u"動態回報自動核准", MboConstants.NOACCESSCHECK)

    # 儲存
    woSet.save()

    wonum = newWo.getString("WONUM")

    # ── 更新資產狀態 ──
    maximoStatus = STATUS_CODE_MAP.get(statusCode, "NOT READY")
    assetMbo.changeStatus(maximoStatus, Date(), u"動態回報觸發", MboConstants.NOACCESSCHECK)
    assetSet.save()

    # ── 回應 ──
    data = JSONObject()
    data.put("wonum", wonum)
    data.put("assetnum", assetnum)
    data.put("status", "APPR")
    data.put("createdAt", sdfISO.format(Date()))

    resp = JSONObject()
    resp.put("data", data)
    responseBody = resp.serialize(True)
    request.getHttpServletResponse().setStatus(201)

except Exception as e:
    if str(e) != "stop":
        error = JSONObject()
        error.put("code", "maximo_error")
        error.put("message", str(e))
        resp = JSONObject()
        resp.put("error", error)
        responseBody = resp.serialize(True)
        request.getHttpServletResponse().setStatus(500)
