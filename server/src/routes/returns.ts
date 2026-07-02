import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { notifyBusinessAction } from "../notifications/dingtalk.js";
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
  status: z.string().trim().min(1, "状态不能为空").default("已提交退货"),
  action: z.enum(["拦截", "召回", "寄回"]),
  trackingNo: z.string().optional().default(""),
  reason: z.enum(["七天无理由", "质量问题"]),
  note: z.string().optional().default("")
});

function rowToReturn(row: Record<string, unknown>) {
  return {
    ...row,
    attachments: JSON.parse(String(row.attachmentJson ?? "[]")) as string[]
  } as Record<string, unknown> & { attachments: string[] };
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
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku,
        GROUP_CONCAT(DISTINCT oi.productName) AS productName,
        SUM(oi.quantity) AS totalQuantity,
        sh.trackingNo AS shipmentTrackingNo
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
        GROUP_CONCAT(DISTINCT p.supplierModel) AS supplierModel,
        SUM(oi.quantity) AS totalQuantity,
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
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    files.forEach((f) => fs.unlink(f.path, () => undefined));
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
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
      "",
      parsed.data.reason,
      parsed.data.note,
      JSON.stringify(attachments),
      nowIso()
    );
  const row = db.prepare("SELECT * FROM returns WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
  const payload = rowToReturn(row);
  void notifyBusinessAction({
    action: "提交退货",
    operator: req.session.user?.username,
    fields: [
      { label: "订单号", value: payload.orderNo },
      { label: "店铺", value: payload.storeName },
      { label: "客户", value: payload.customerName },
      { label: "电话", value: payload.customerPhone },
      { label: "地址", value: payload.address },
      { label: "型号", value: payload.model },
      { label: "退货操作", value: payload.action },
      { label: "退货理由", value: payload.reason },
      { label: "备注", value: payload.note },
      { label: "附件数量", value: payload.attachments.length }
    ]
  });
  res.status(201).json(payload);
});

const returnStatusSchema = z.object({
  status: z.enum(["待处理", "已处理", "已提交退货", "已安排退回", "已收货"]),
  trackingNo: z.string().optional().default("")
});

returnsRouter.patch("/:id/status", (req, res) => {
  const parsed = returnStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  const current = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(id) as
    | { id: number; orderNo: string; action: string }
    | undefined;
  if (!current) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  let trackingNo = parsed.data.trackingNo.trim();
  if (parsed.data.status === "已安排退回") {
    if (current.action === "寄回") {
      if (!trackingNo) {
        res.status(400).json({ message: "寄回需要填写快递单号" });
        return;
      }
    } else {
      trackingNo = latestTrackingNo(current.orderNo);
      if (!trackingNo) {
        res.status(400).json({ message: "未找到原订单快递单号，请先在发货信息中登记快递单号" });
        return;
      }
    }
  }
  const result = getDb()
    .prepare("UPDATE returns SET status = ?, trackingNo = CASE WHEN ? <> '' THEN ? ELSE trackingNo END, updatedAt = ? WHERE id = ?")
    .run(parsed.data.status, trackingNo, trackingNo, nowIso(), id);
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  const row = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(id) as Record<string, unknown>;
  const payload = rowToReturn(row);
  void notifyBusinessAction({
    action: parsed.data.status === "已收货" ? "退货收货" : "退货操作",
    operator: req.session.user?.username,
    fields: [
      { label: "订单号", value: payload.orderNo },
      { label: "客户", value: payload.customerName },
      { label: "退货操作", value: payload.action },
      { label: "快递单号", value: payload.trackingNo },
      { label: "状态", value: payload.status },
      { label: "退货理由", value: payload.reason },
      { label: "备注", value: payload.note }
    ]
  });
  res.json(payload);
});

returnsRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const id = Number(req.params.id);
  const row = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  const result = getDb().prepare("DELETE FROM returns WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  const payload = row ? rowToReturn(row) : null;
  void notifyBusinessAction({
    action: "撤销退货",
    operator: req.session.user?.username,
    fields: [
      { label: "订单号", value: payload?.orderNo },
      { label: "客户", value: payload?.customerName },
      { label: "退货操作", value: payload?.action },
      { label: "退货理由", value: payload?.reason }
    ]
  });
  res.json({ ok: true });
});
