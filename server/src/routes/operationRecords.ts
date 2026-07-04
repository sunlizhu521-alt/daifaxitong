import { Router } from "express";
import { config } from "../config.js";
import { getDb } from "../db/index.js";

export const operationRecordsRouter = Router();

operationRecordsRouter.get("/", (req, res) => {
  const { keyword = "", startDate = "", endDate = "", page = "1", pageSize = "50" } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const offset = (pageNum - 1) * pageSizeNum;
  const filters: string[] = [];
  const params: unknown[] = [];

  if (keyword) {
    filters.push(
      "(oe.operator LIKE ? OR oe.action LIKE ? OR oe.detail LIKE ? OR o.orderNo LIKE ? OR o.purchaseOrderNo LIKE ? OR o.storeName LIKE ? OR o.customerName LIKE ? OR o.customerPhone LIKE ? OR o.address LIKE ? OR oi.productName LIKE ? OR oi.productSku LIKE ? OR p.series LIKE ? OR latestReturn.trackingNo LIKE ?)"
    );
    const like = `%${keyword}%`;
    params.push(like, like, like, like, like, like, like, like, like, like, like, like, like);
  }
  if (startDate) {
    filters.push("date(oe.createdAt) >= date(?)");
    params.push(startDate);
  }
  if (endDate) {
    filters.push("date(oe.createdAt) <= date(?)");
    params.push(endDate);
  }

  const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const countSql = `SELECT COUNT(DISTINCT oe.id) AS total
    FROM order_events oe
    LEFT JOIN orders o ON o.id = oe.orderId
    LEFT JOIN order_items oi ON oi.orderId = o.id
    LEFT JOIN products p ON p.id = oi.productId
    LEFT JOIN returns latestReturn ON latestReturn.id = (
      SELECT lr.id
      FROM returns lr
      WHERE lr.orderId = o.id
      ORDER BY lr.id DESC
      LIMIT 1
    )
    ${whereSql}`;
  const { total } = getDb().prepare(countSql).get(...params) as { total: number };

  const rows = getDb()
    .prepare(
      `SELECT oe.id, oe.orderId, oe.action, oe.detail, oe.operator, oe.createdAt,
        o.orderNo, o.purchaseOrderNo, o.orderType, o.storeName,
        COALESCE((SELECT st.shortName FROM stores st WHERE st.name = o.storeName ORDER BY st.id DESC LIMIT 1), o.storeName) AS storeShortName,
        o.customerName, o.customerPhone, o.address, o.status,
        GROUP_CONCAT(DISTINCT oi.productName) AS productName,
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku,
        GROUP_CONCAT(DISTINCT p.series) AS productSeries,
        latest.trackingNo AS trackingNo,
        latest.carrier AS carrier,
        '' AS returnCarrier,
        latestReturn.trackingNo AS returnTrackingNo,
        COALESCE(shipSupplier.shortName, shipSupplier.name, orderSupplier.shortName, orderSupplier.name) AS supplierName
       FROM order_events oe
       LEFT JOIN orders o ON o.id = oe.orderId
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       LEFT JOIN shipments latest ON latest.id = (
         SELECT sh.id FROM shipments sh WHERE sh.orderId = o.id ORDER BY sh.id DESC LIMIT 1
       )
       LEFT JOIN returns latestReturn ON latestReturn.id = (
         SELECT lr.id
         FROM returns lr
         WHERE lr.orderId = o.id
         ORDER BY lr.id DESC
         LIMIT 1
       )
       LEFT JOIN suppliers shipSupplier ON shipSupplier.id = latest.supplierId
       LEFT JOIN suppliers orderSupplier ON orderSupplier.id = o.supplierId
       ${whereSql}
       GROUP BY oe.id
       ORDER BY oe.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSizeNum, offset);

  res.json({ rows, total, page: pageNum, pageSize: pageSizeNum });
});

operationRecordsRouter.delete("/:id", (req, res) => {
  if (req.session.user?.username !== config.adminUsername && req.session.user?.username !== "孙立柱") {
    res.status(403).json({ message: "只有孙立柱可以删除操作记录" });
    return;
  }
  const result = getDb().prepare("DELETE FROM order_events WHERE id = ?").run(Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "操作记录不存在" });
    return;
  }
  res.json({ ok: true });
});
