# -*- coding: utf-8 -*-
"""
VDASH_DEPOTS — 機務段清單
Maximo Automation Script (Jython)

GET /api/v1/depots
回傳所有啟用中的機務段基本資料

MBO: LOCATIONS
快取建議: Cache-Control: public, max-age=300
"""

from psdi.server import MXServer
from psdi.mbo import MboConstants
from com.ibm.json.java import JSONObject, JSONArray
from java.util import Date
from java.text import SimpleDateFormat

try:
    sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX")
    now = sdf.format(Date())

    # 查詢所有啟用中的機務段
    locSet = MXServer.getMXServer().getMboSet("LOCATIONS", userInfo)
    locSet.setWhere("type = 'DEPOT' and status = 'OPERATING' and siteid = 'TRA'")
    locSet.setOrderBy("location")
    locSet.reset()

    depots = JSONArray()
    total = 0
    loc = locSet.moveFirst()

    while loc is not None:
        depot = JSONObject()
        depot.put("code", loc.getString("LOCATION"))
        depot.put("name", loc.getString("DESCRIPTION"))
        depot.put("location", loc.getString("STREETADDRESS"))

        # 子查詢：該段車輛數
        assetWhere = "location = '%s' and siteid = 'TRA' and status != 'DECOMMISSIONED'" % loc.getString("LOCATION")
        assetSet = MXServer.getMXServer().getMboSet("ASSET", userInfo)
        assetSet.setWhere(assetWhere)
        vehicleCount = assetSet.count()
        depot.put("vehicleCount", vehicleCount)

        # 可用率（可用車輛 / 總車輛）
        activeWhere = assetWhere + " and status in ('OPERATING', 'ACTIVE')"
        activeSet = MXServer.getMXServer().getMboSet("ASSET", userInfo)
        activeSet.setWhere(activeWhere)
        activeCount = activeSet.count()
        rate = round(float(activeCount) / vehicleCount * 100, 1) if vehicleCount > 0 else 0.0
        depot.put("availabilityRate", rate)

        # 待保養數（進行中或已排程的 PM/CM 工單）
        pmWhere = ("assetnum in (select assetnum from asset where location = '%s' and siteid = 'TRA') "
                   "and worktype in ('PM','CM') and status in ('APPR','WMATL','INPRG') and siteid = 'TRA'"
                   % loc.getString("LOCATION"))
        pmSet = MXServer.getMXServer().getMboSet("WORKORDER", userInfo)
        pmSet.setWhere(pmWhere)
        depot.put("pendingMaintenance", pmSet.count())

        depots.add(depot)
        total += 1
        loc = locSet.moveNext()

    # 組裝回應
    meta = JSONObject()
    meta.put("total", total)
    meta.put("cached", True)
    meta.put("generatedAt", now)

    resp = JSONObject()
    resp.put("data", depots)
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
