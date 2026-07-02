import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { ROLE_ADMIN } from "../permissions.js";

export const returnsRouter = Router();

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname).toLowerCase();
    callback(null, `return-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({
  storage,
  fileFilter: (_req, file, callback) => {
    callback(null, file.mimetype.startsWith("image/"));
  },
  limits: { files: 8, fileSize: 5 * 1024 * 1024 }
});

const returnSchema = z.object({
  storeName: z.string().trim().min(1, "店铺不能为空"),
  operator: z.string().optional().default(""),
  orderNo: z.string().trim().min(1, "订单号不能为空"),
  model: z.string().trim().min(1, "型号不能为空"),
  customerName: z.string().trim().min(1, "姓名不能为空"),
  customerPhone: z.string().optional().default(""),
  address: z.string().trim().min(1, "地址不能为空"),
  status: z.string().trim().min(1, "状态不能为空").default("待处理"),
  action: z.enum(["拦截", "召回", "寄回"]),
  trackingNo: z.string().optional().default(""),
  reason: z.enum(["七天无理由", "质量问题"]),
  note: z.string().optional().default("")
});

function rowToReturn(row: Record<string, unknown>) {
  return {
    ...row,
    attachments: JSON.parse(String(row.attachmentJson ?? "[]")) as string[]
  };
}

function latestTrackingNo(orderNo: string) {
  const row = getDb()
    .prepare(
      `SELECT sh.trackingNo
       FROM orders o
       JOIN shipments sh ON sh.orderId = o.id
       WHERE o.orderNo = ?
       ORDER BY sh.id DESC
       LIMIT 1`
    )
    .get(orderNo) as { trackingNo?: string } | undefined;
  return row?.trackingNo ?? "";
}

returnsRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const storeName = String(req.query.storeName ?? "").trim();
  const supplierId = String(req.query.supplierId ?? "").trim();
  const series = String(req.query.series ?? "").trim();
  const sku = String(req.query.sku ?? "").trim();
  const startDate = String(req.query.startDate ?? "").trim();
  const endDate = String(req.query.endDate ?? "").trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    filters.push(
      "(r.storeName LIKE ? OR r.operator LIKE ? OR r.orderNo LIKE ? OR r.model LIKE ? OR r.customerName LIKE ? OR r.customerPhone LIKE ? OR r.address LIKE ? OR r.trackingNo LIKE ? OR r.reason LIKE ? OR r.note LIKE ? OR o.status LIKE ? OR oi.productSku LIKE ? OR p.series LIKE ? OR s.name LIKE ? OR s.shortName LIKE ?)"
    );
    params.push(
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`
    );
  }
  if (status) {
    filters.push("r.status = ?");
    params.push(status);
  }
  if (storeName) {
    filters.push("r.storeName = ?");
    params.push(storeName);
  }
  if (supplierId) {
    filters.push("COALESCE(sh.supplierId, o.supplierId) = ?");
    params.push(Number(supplierId));
  }
  if (series) {
    filters.push("p.series = ?");
    params.push(series);
  }
  if (sku) {
    filters.push("oi.productSku = ?");
    params.push(sku);
  }
  if (startDate) {
    filters.push("date(o.createdAt) >= date(?)");
    params.push(startDate);
  }
  if (endDate) {
    filters.push("date(o.createdAt) <= date(?)");
    params.push(endDate);
  }
  const rows = getDb()
    .prepare(
      `SELECT r.*, COALESCE(s.shortName, s.name) AS supplierName,
        GROUP_CONCAT(DISTINCT p.series) AS productSeries,
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku
       FROM returns r
       LEFT JOIN orders o ON o.orderNo = r.orderNo
       LEFT JOIN shipments sh ON sh.id = (
         SELECT latest.id FROM shipments latest WHERE latest.orderId = o.id ORDER BY latest.id DESC LIMIT 1
       )
       LEFT JOIN suppliers s ON s.id = COALESCE(sh.supplierId, o.supplierId)
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       GROUP BY r.id
       ORDER BY r.id DESC`
    )
    .all(...params) as Record<string, unknown>[];
  res.json(rows.map(rowToReturn));
});

returnsRouter.get("/orders", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const storeName = String(req.query.storeName ?? "").trim();
  const supplierId = String(req.query.supplierId ?? "").trim();
  const series = String(req.query.series ?? "").trim();
  const sku = String(req.query.sku ?? "").trim();
  const startDate = String(req.query.startDate ?? "").trim();
  const endDate = String(req.query.endDate ?? "").trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    filters.push(
      "(o.storeName LIKE ? OR o.orderNo LIKE ? OR o.customerName LIKE ? OR o.customerPhone LIKE ? OR o.address LIKE ? OR o.status LIKE ? OR latestReturn.action LIKE ? OR latestReturn.reason LIKE ? OR latestReturn.note LIKE ? OR latestReturn.trackingNo LIKE ? OR oi.productName LIKE ? OR oi.productSku LIKE ? OR p.series LIKE ? OR s.name LIKE ? OR s.shortName LIKE ?)"
    );
    params.push(
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`,
      `%${keyword}%`
    );
  }
  if (storeName) {
    filters.push("o.storeName = ?");
    params.push(storeName);
  }
  if (supplierId) {
    filters.push("COALESCE(sh.supplierId, o.supplierId) = ?");
    params.push(Number(supplierId));
  }
  if (series) {
    filters.push("p.series = ?");
    params.push(series);
  }
  if (sku) {
    filters.push("oi.productSku = ?");
    params.push(sku);
  }
  if (startDate) {
    filters.push("date(o.createdAt) >= date(?)");
    params.push(startDate);
  }
  if (endDate) {
    filters.push("date(o.createdAt) <= date(?)");
    params.push(endDate);
  }
  const rows = getDb()
    .prepare(
      `SELECT o.id AS orderId, o.orderNo, o.storeName, o.customerName, o.customerPhone, o.address, o.status AS orderStatus,
        COALESCE(s.shortName, s.name) AS supplierName,
        GROUP_CONCAT(DISTINCT p.series) AS productSeries,
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku,
        GROUP_CONCAT(DISTINCT oi.productName) AS productName,
        sh.trackingNo AS shipmentTrackingNo,
        latestReturn.id AS returnId, latestReturn.operator, latestReturn.model, latestReturn.status AS returnStatus,
        latestReturn.action, latestReturn.trackingNo AS returnTrackingNo, latestReturn.reason, latestReturn.note,
        latestReturn.attachmentJson, latestReturn.createdAt AS returnCreatedAt
       FROM orders o
       LEFT JOIN shipments sh ON sh.id = (
         SELECT latestShipment.id FROM shipments latestShipment WHERE latestShipment.orderId = o.id ORDER BY latestShipment.id DESC LIMIT 1
       )
       LEFT JOIN returns latestReturn ON latestReturn.id = (
         SELECT latest.id FROM returns latest WHERE latest.orderNo = o.orderNo ORDER BY latest.id DESC LIMIT 1
       )
       LEFT JOIN suppliers s ON s.id = COALESCE(sh.supplierId, o.supplierId)
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       GROUP BY o.id
       ORDER BY o.id DESC`
    )
    .all(...params) as Record<string, unknown>[];
  res.json(
    rows.map((row) => ({
      ...row,
      attachments: JSON.parse(String(row.attachmentJson ?? "[]")) as string[]
    }))
  );
});

returnsRouter.post("/", upload.array("attachments", 8), (req, res) => {
  const parsed = returnSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }

  const trackingNo = parsed.data.action === "寄回" ? parsed.data.trackingNo.trim() : latestTrackingNo(parsed.data.orderNo);
  if (parsed.data.action === "寄回" && !trackingNo) {
    res.status(400).json({ message: "寄回需要填写快递单号" });
    return;
  }
  if (parsed.data.action !== "寄回" && !trackingNo) {
    res.status(400).json({ message: "未找到原订单快递单号，请先在发货信息中登记快递单号" });
    return;
  }

  const files = (req.files as Express.Multer.File[] | undefined) ?? [];
  const attachments = files.map((file) => `/uploads/${file.filename}`);
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO returns
       (storeName, operator, orderNo, model, customerName, customerPhone, address, status, action, trackingNo, reason, note, attachmentJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      parsed.data.storeName,
      parsed.data.operator,
      parsed.data.orderNo,
      parsed.data.model,
      parsed.data.customerName,
      parsed.data.customerPhone,
      parsed.data.address,
      parsed.data.status,
      parsed.data.action,
      trackingNo,
      parsed.data.reason,
      parsed.data.note,
      JSON.stringify(attachments),
      nowIso()
    );
  const row = db.prepare("SELECT * FROM returns WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
  res.status(201).json(rowToReturn(row));
});

const returnStatusSchema = z.object({
  status: z.enum(["待处理", "已处理"])
});

returnsRouter.patch("/:id/status", (req, res) => {
  const parsed = returnStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const result = getDb()
    .prepare("UPDATE returns SET status = ?, updatedAt = ? WHERE id = ?")
    .run(parsed.data.status, nowIso(), Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  const row = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(Number(req.params.id)) as Record<string, unknown>;
  res.json(rowToReturn(row));
});

returnsRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const result = getDb().prepare("DELETE FROM returns WHERE id = ?").run(Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  res.json({ ok: true });
});
