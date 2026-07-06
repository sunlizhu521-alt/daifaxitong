import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { fallbackLogisticsStatus, queryKuaidi100Status } from "../logistics/kuaidi100.js";
import { notifyBusinessAction } from "../notifications/dingtalk.js";
import { logOrderEvent, logOrderEventByOrderNo } from "../orderEvents.js";
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
  orderId: z.coerce.number().int().positive().optional(),
  storeName: z.string().trim().min(1, "店铺不能为空"),
  operator: z.string().optional().default(""),
  orderNo: z.string().trim().min(1, "订单号不能为空"),
  model: z.string().trim().min(1, "型号不能为空"),
  customerName: z.string().trim().min(1, "姓名不能为空"),
  customerPhone: z.string().optional().default(""),
  address: z.string().trim().min(1, "地址不能为空"),
  status: z.string().trim().min(1, "状态不能为空").default("已提交退货"),
  action: z.enum(["拦截", "自行寄回", "上门取件", "寄回"]).transform((value) => (value === "寄回" ? "自行寄回" : value)),
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

function latestTrackingNo(orderNo: string, orderId?: number | null) {
  const row = getDb()
    .prepare(
      `SELECT sh.trackingNo
       FROM orders o
       JOIN shipments sh ON sh.orderId = o.id
       WHERE ${orderId ? "o.id = ?" : "o.orderNo = ?"}
       ORDER BY sh.id DESC
       LIMIT 1`
    )
    .get(orderId ?? orderNo) as { trackingNo?: string } | undefined;
  return row?.trackingNo ?? "";
}

returnsRouter.get("/", async (req, res) => {
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
        sh.carrier AS shipmentCarrier,
        sh.carrier AS returnCarrier,
        sh.trackingNo AS shipmentTrackingNo
       FROM returns r
       LEFT JOIN orders o ON o.id = r.orderId
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
  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      const payload = rowToReturn(row);
      const trackingNo = String(payload.trackingNo ?? "");
      const carrierName = String(payload.returnCarrier ?? payload.shipmentCarrier ?? "");
      const realStatus = await queryKuaidi100Status({
        carrierName,
        trackingNo,
        phone: String(payload.customerPhone ?? "")
      }).catch(() => null);
      return {
        ...payload,
        returnLogisticsStatus: realStatus ?? fallbackLogisticsStatus("", trackingNo, String(payload.status ?? ""))
      };
    })
  );
  res.json(enrichedRows);
});

returnsRouter.get("/orders", async (req, res) => {
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
      `SELECT o.id AS orderId, o.orderNo, o.orderType, o.storeName, o.customerName, o.customerPhone, o.address, o.status AS orderStatus,
        COALESCE(s.shortName, s.name) AS supplierName,
        GROUP_CONCAT(DISTINCT p.series) AS productSeries,
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku,
        GROUP_CONCAT(DISTINCT oi.productName) AS productName,
        GROUP_CONCAT(DISTINCT p.supplierModel) AS supplierModel,
        SUM(oi.quantity) AS totalQuantity,
        sh.carrier AS shipmentCarrier,
        sh.trackingNo AS shipmentTrackingNo,
        latestReturn.id AS returnId, latestReturn.operator, latestReturn.model, latestReturn.status AS returnStatus,
        latestReturn.action, latestReturn.trackingNo AS returnTrackingNo, latestReturn.reason, latestReturn.note,
        latestReturn.attachmentJson, latestReturn.createdAt AS returnCreatedAt
       FROM orders o
       LEFT JOIN shipments sh ON sh.id = (
         SELECT latestShipment.id FROM shipments latestShipment WHERE latestShipment.orderId = o.id ORDER BY latestShipment.id DESC LIMIT 1
       )
       LEFT JOIN returns latestReturn ON latestReturn.id = (
         SELECT latest.id
         FROM returns latest
         WHERE latest.orderId = o.id
         ORDER BY latest.id DESC
         LIMIT 1
       )
       LEFT JOIN suppliers s ON s.id = COALESCE(sh.supplierId, o.supplierId)
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       GROUP BY o.id
       ORDER BY o.id DESC`
    )
    .all(...params) as Record<string, unknown>[];
  const enrichedRows = await Promise.all(
    rows.map(async (row) => {
      const trackingNo = String(row.shipmentTrackingNo ?? "");
      const fallbackStatus = fallbackLogisticsStatus(String(row.orderStatus ?? ""), trackingNo, String(row.returnStatus ?? ""));
      const realStatus =
        fallbackStatus === "已签收"
          ? "已签收"
          : await queryKuaidi100Status({
              carrierName: String(row.shipmentCarrier ?? ""),
              trackingNo,
              phone: String(row.customerPhone ?? "")
            });
      return {
      ...row,
        logisticsStatus: realStatus ?? fallbackStatus,
        attachments: JSON.parse(String(row.attachmentJson ?? "[]")) as string[]
      };
    })
  );
  res.json(enrichedRows);
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
  const order = parsed.data.orderId
    ? (db.prepare("SELECT id, orderNo FROM orders WHERE id = ?").get(parsed.data.orderId) as { id: number; orderNo: string } | undefined)
    : (db.prepare("SELECT id, orderNo FROM orders WHERE orderNo = ?").get(parsed.data.orderNo) as { id: number; orderNo: string } | undefined);
  if (!order || order.orderNo !== parsed.data.orderNo) {
    files.forEach((f) => fs.unlink(f.path, () => undefined));
    res.status(400).json({ message: "退货订单不存在或订单编号不匹配" });
    return;
  }
  const result = db
    .prepare(
      `INSERT INTO returns
       (orderId, storeName, operator, operationUser, orderNo, model, customerName, customerPhone, address, status, action, trackingNo, reason, note, attachmentJson, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      order.id,
      parsed.data.storeName,
      parsed.data.operator,
      req.session.user?.username ?? "",
      parsed.data.orderNo,
      parsed.data.model,
      parsed.data.customerName,
      parsed.data.customerPhone,
      parsed.data.address,
      parsed.data.status,
      parsed.data.action,
      parsed.data.trackingNo,
      parsed.data.reason,
      parsed.data.note,
      JSON.stringify(attachments),
      nowIso()
    );
  const row = db.prepare("SELECT * FROM returns WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
  const payload = rowToReturn(row);
  logOrderEvent(order.id, "提交退货", `${parsed.data.action} / ${parsed.data.reason}`, req.session.user?.username);
  void notifyBusinessAction({
    action: "退货登记",
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
  status: z.enum(["待处理", "已处理", "已提交退货", "已安排退回", "退货待接收", "已收货", "已收到退货", "退回中", "退货成功"]),
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
    | { id: number; orderId?: number | null; orderNo: string; action: string }
    | undefined;
  if (!current) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  let trackingNo = parsed.data.trackingNo.trim();
  if (parsed.data.status === "已安排退回" || parsed.data.status === "退货待接收" || parsed.data.status === "退回中") {
    if (current.action !== "自行寄回" && current.action !== "寄回" && current.action !== "上门取件" && !trackingNo) {
      trackingNo = latestTrackingNo(current.orderNo, current.orderId);
    }
  }
  const result = getDb()
    .prepare("UPDATE returns SET status = ?, trackingNo = CASE WHEN ? <> '' THEN ? ELSE trackingNo END, operationUser = ?, updatedAt = ? WHERE id = ?")
    .run(parsed.data.status, trackingNo, trackingNo, req.session.user?.username ?? "", nowIso(), id);
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  const row = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(id) as Record<string, unknown>;
  const payload = rowToReturn(row);
  const eventAction = parsed.data.status === "已收货" || parsed.data.status === "已收到退货" || parsed.data.status === "退货成功" ? "退货收货" : "退货操作";
  const eventDetail = `${payload.status}${payload.trackingNo ? ` / ${payload.trackingNo}` : ""}`;
  const payloadOrderId = Number(payload.orderId);
  if (Number.isFinite(payloadOrderId) && payloadOrderId > 0) {
    logOrderEvent(payloadOrderId, eventAction, eventDetail, req.session.user?.username);
  } else {
    logOrderEventByOrderNo(String(payload.orderNo), eventAction, eventDetail, req.session.user?.username);
  }
  void notifyBusinessAction({
    action: parsed.data.status === "已收货" || parsed.data.status === "已收到退货" || parsed.data.status === "退货成功" ? "退货收货" : "退货操作",
    operator: req.session.user?.username,
    fields: [
      { label: "订单号", value: payload.orderNo },
      { label: "客户", value: payload.customerName },
      { label: "退货操作", value: payload.action },
      { label: "发货单号", value: payload.trackingNo },
      { label: "状态", value: payload.status },
      { label: "退货理由", value: payload.reason },
      { label: "备注", value: payload.note }
    ]
  });
  res.json(payload);
});

returnsRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN || req.session.user?.username !== config.adminUsername) {
    res.status(403).json({ message: "只有孙立柱管理员可以删除退货记录" });
    return;
  }
  const id = Number(req.params.id);
  const row = getDb().prepare("SELECT * FROM returns WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!row) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  if (String(row.status ?? "") !== "已提交退货") {
    res.status(409).json({ message: "退货已操作，不能撤销" });
    return;
  }
  const result = getDb().prepare("DELETE FROM returns WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "退货记录不存在" });
    return;
  }
  const payload = row ? rowToReturn(row) : null;
  if (payload?.orderNo) {
    const payloadOrderId = Number(payload.orderId);
    if (Number.isFinite(payloadOrderId) && payloadOrderId > 0) {
      logOrderEvent(payloadOrderId, "撤销退货", `${payload.action ?? "-"} / ${payload.reason ?? "-"}`, req.session.user?.username);
    } else {
      logOrderEventByOrderNo(String(payload.orderNo), "撤销退货", `${payload.action ?? "-"} / ${payload.reason ?? "-"}`, req.session.user?.username);
    }
  }
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
