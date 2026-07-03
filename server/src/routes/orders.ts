import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { notifyBusinessAction } from "../notifications/dingtalk.js";
import { ROLE_ADMIN } from "../permissions.js";
import { optionalId } from "../utils.js";

export const ordersRouter = Router();
const upload = multer({ dest: config.uploadDir });

const orderItemSchema = z.object({
  productId: optionalId,
  productName: z.string().trim().min(1, "商品名称不能为空"),
  productSku: z.string().trim().min(1, "SKU/规格不能为空"),
  quantity: z.coerce.number().int().positive("数量必须大于 0"),
  unitCost: z.coerce.number().min(0).default(0),
  unitSalePrice: z.coerce.number().min(0).default(0)
});

const orderSchema = z.object({
  orderNo: z.string().trim().min(1, "订单号不能为空"),
  purchaseOrderNo: z.string().optional(),
  purchaseOrderUser: z.string().optional().default(""),
  orderType: z.enum(["dropship", "accessory"]).optional(),
  supplierId: optionalId,
  storeName: z.string().optional().default(""),
  registrarName: z.string().optional().default(""),
  customerName: z.string().trim().min(1, "客户姓名不能为空"),
  customerPhone: z.string().optional().default(""),
  address: z.string().trim().min(1, "收货地址不能为空"),
  status: z.enum(["pending", "filled", "purchased", "shipped", "exception", "cancelled"]).default("pending"),
  note: z.string().optional().default(""),
  items: z.array(orderItemSchema).min(1, "至少需要一个商品明细")
});

const shipSchema = z.object({
  supplierId: optionalId,
  carrierId: optionalId,
  carrier: z.string().trim().min(1, "快递公司不能为空"),
  trackingNo: z.string().trim().min(1, "发货单号不能为空"),
  shippedAt: z.string().trim().min(1, "发货时间不能为空"),
  status: z.enum(["filled", "shipped", "exception"]).default("filled"),
  note: z.string().optional().default("")
});

const purchaseOrderSchema = z.object({
  purchaseOrderNo: z.string().trim().min(1, "采购订单号不能为空"),
  purchaseOrderUser: z.string().optional().default("")
});

const statusSchema = z.object({
  status: z.enum(["pending", "filled", "purchased", "shipped", "exception", "cancelled"])
});

const shippingEditSchema = z.object({
  supplierId: optionalId,
  productId: optionalId,
  productName: z.string().trim().min(1, "商品名称不能为空"),
  productSku: z.string().trim().min(1, "SKU不能为空"),
  quantity: z.coerce.number().int().positive("数量必须大于 0"),
  note: z.string().optional().default("")
});

const statusText: Record<string, string> = {
  pending: "待发货",
  filled: "已填单号",
  purchased: "已下采购单",
  shipped: "已发货",
  exception: "异常",
  cancelled: "已取消"
};

function logOrderEvent(orderId: number, action: string, detail: string, operator?: string) {
  getDb()
    .prepare("INSERT INTO order_events (orderId, action, detail, operator) VALUES (?, ?, ?, ?)")
    .run(orderId, action, detail, operator ?? "");
}

function readOrder(id: number) {
  const db = getDb();
  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  if (!order) return null;
  const items = db.prepare("SELECT * FROM order_items WHERE orderId = ? ORDER BY id").all(id);
  const shipments = db
    .prepare(
      `SELECT sh.*, s.name AS supplierName, c.name AS carrierName
       FROM shipments sh
       LEFT JOIN suppliers s ON s.id = sh.supplierId
       LEFT JOIN carriers c ON c.id = sh.carrierId
       WHERE sh.orderId = ?
       ORDER BY sh.id DESC`
    )
    .all(id);
  return { ...(order as object), items, shipments };
}

function saveOrder(data: z.infer<typeof orderSchema>, id?: number) {
  const db = getDb();
  const tx = db.transaction(() => {
    let orderId = id;
    if (orderId) {
      const result = db
        .prepare(
          "UPDATE orders SET orderNo = ?, purchaseOrderNo = COALESCE(?, purchaseOrderNo), purchaseOrderUser = COALESCE(?, purchaseOrderUser), orderType = COALESCE(?, orderType), supplierId = ?, storeName = ?, registrarName = ?, customerName = ?, customerPhone = ?, address = ?, status = ?, note = ?, updatedAt = ? WHERE id = ?"
        )
        .run(data.orderNo, data.purchaseOrderNo ?? null, data.purchaseOrderUser || null, data.orderType ?? null, data.supplierId ?? null, data.storeName, data.registrarName, data.customerName, data.customerPhone, data.address, data.status, data.note, nowIso(), orderId);
      if (result.changes === 0) throw new Error("NOT_FOUND");
      db.prepare("DELETE FROM order_items WHERE orderId = ?").run(orderId);
    } else {
      const result = db
        .prepare(
          "INSERT INTO orders (orderNo, purchaseOrderNo, purchaseOrderUser, orderType, supplierId, storeName, registrarName, customerName, customerPhone, address, status, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(data.orderNo, data.purchaseOrderNo ?? "", data.purchaseOrderUser, data.orderType ?? "dropship", data.supplierId ?? null, data.storeName, data.registrarName, data.customerName, data.customerPhone, data.address, data.status, data.note, nowIso());
      orderId = Number(result.lastInsertRowid);
    }
    const insertItem = db.prepare(
      "INSERT INTO order_items (orderId, productId, productName, productSku, quantity, unitCost, unitSalePrice) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const item of data.items) {
      insertItem.run(
        orderId,
        item.productId ?? null,
        item.productName,
        item.productSku,
        item.quantity,
        item.unitCost,
        item.unitSalePrice
      );
    }
    return orderId;
  });
  return readOrder(tx());
}

ordersRouter.get("/", (req, res) => {
  const { keyword = "", status = "", supplierId = "", storeName = "", series = "", sku = "", startDate = "", endDate = "", hasTracking = "", orderType = "", page = "1", pageSize = "50" } = req.query;
  const pageNum = Math.max(1, Number(page) || 1);
  const pageSizeNum = Math.min(200, Math.max(1, Number(pageSize) || 50));
  const offset = (pageNum - 1) * pageSizeNum;
  const filters: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    filters.push("(o.orderNo LIKE ? OR o.purchaseOrderNo LIKE ? OR o.purchaseOrderUser LIKE ? OR o.storeName LIKE ? OR o.customerName LIKE ? OR o.customerPhone LIKE ? OR o.address LIKE ? OR oi.productName LIKE ? OR oi.productSku LIKE ? OR p.series LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    filters.push("o.status = ?");
    params.push(status);
  }
  if (orderType) {
    filters.push("o.orderType = ?");
    params.push(orderType);
  }
  if (supplierId) {
    filters.push("(o.supplierId = ? OR EXISTS (SELECT 1 FROM shipments sh WHERE sh.orderId = o.id AND sh.supplierId = ?))");
    params.push(Number(supplierId), Number(supplierId));
  }
  if (storeName) {
    filters.push("o.storeName = ?");
    params.push(storeName);
  }
  if (series) {
    filters.push("p.series = ?");
    params.push(series);
  }
  if (sku) {
    filters.push("(oi.productSku = ? OR p.sku = ? OR p.ssku = ?)");
    params.push(sku, sku, sku);
  }
  if (startDate) {
    filters.push("date(o.createdAt) >= date(?)");
    params.push(startDate);
  }
  if (endDate) {
    filters.push("date(o.createdAt) <= date(?)");
    params.push(endDate);
  }
  if (hasTracking === "yes") {
    filters.push("COALESCE(latest.trackingNo, '') <> ''");
  }
  if (hasTracking === "no") {
    filters.push("COALESCE(latest.trackingNo, '') = ''");
  }
  const countSql = `SELECT COUNT(DISTINCT o.id) AS total FROM orders o
    LEFT JOIN order_items oi ON oi.orderId = o.id
    LEFT JOIN products p ON p.id = oi.productId
    LEFT JOIN shipments latest ON latest.id = (
      SELECT sh.id FROM shipments sh WHERE sh.orderId = o.id ORDER BY sh.id DESC LIMIT 1
    )
    LEFT JOIN suppliers shipSupplier ON shipSupplier.id = latest.supplierId
    LEFT JOIN suppliers orderSupplier ON orderSupplier.id = o.supplierId
    ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}`;
  const { total } = getDb().prepare(countSql).get(...params) as { total: number };
  const rows = getDb()
    .prepare(
      `SELECT o.*, COUNT(oi.id) AS itemCount, SUM(oi.quantity) AS totalQuantity,
        GROUP_CONCAT(DISTINCT oi.productName) AS productName,
        GROUP_CONCAT(DISTINCT p.series) AS productSeries,
        GROUP_CONCAT(DISTINCT oi.productSku) AS productSku,
        GROUP_CONCAT(DISTINCT p.supplierModel) AS supplierModel,
        latest.carrierId AS carrierId, latest.carrier AS carrier, latest.trackingNo AS trackingNo, latest.shippedAt AS shippedAt,
        latest.note AS shipmentNote,
        (
          SELECT GROUP_CONCAT(eventText, '；') FROM (
            SELECT oe.createdAt || ' ' || COALESCE(oe.operator, '') || ' ' || oe.action ||
              CASE WHEN COALESCE(oe.detail, '') <> '' THEN '：' || oe.detail ELSE '' END AS eventText
            FROM order_events oe
            WHERE oe.orderId = o.id
            ORDER BY oe.id DESC
            LIMIT 6
          )
        ) AS operationLogs,
        COALESCE(shipSupplier.shortName, shipSupplier.name, orderSupplier.shortName, orderSupplier.name) AS supplierName,
        COALESCE(orderSupplier.shortName, orderSupplier.name) AS registrationSupplierName
       FROM orders o
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       LEFT JOIN shipments latest ON latest.id = (
         SELECT sh.id FROM shipments sh WHERE sh.orderId = o.id ORDER BY sh.id DESC LIMIT 1
       )
       LEFT JOIN suppliers shipSupplier ON shipSupplier.id = latest.supplierId
       LEFT JOIN suppliers orderSupplier ON orderSupplier.id = o.supplierId
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       GROUP BY o.id
       ORDER BY o.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params, pageSizeNum, offset);
  res.json({ rows, total, page: pageNum, pageSize: pageSizeNum });
});

ordersRouter.get("/template", async (_req, res) => {
  const XLSX = (await import("xlsx")).default;
  const rows = [
    {
      订单号: "DF20260701001",
      采购订单号: "",
      店铺: "示例店铺",
      供应商: "示例供应商",
      登记人: "admin",
      客户姓名: "张三",
      客户电话: "13800000000",
      收货地址: "上海市浦东新区示例路 1 号",
      商品名称: "示例商品",
      SKU规格: "默认规格",
      数量: 1,
      备注: ""
    }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "订单导入模板");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent("订单导入模板.xlsx"));
  res.send(buffer);
});

ordersRouter.get("/export", async (req, res) => {
  const XLSX = (await import("xlsx")).default;
  const rows = getDb()
    .prepare(
      `SELECT o.orderNo AS 订单号, o.storeName AS 店铺, COALESCE(orderSupplier.shortName, orderSupplier.name) AS 供应商, o.registrarName AS 登记人,
        o.purchaseOrderNo AS 采购订单号, o.purchaseOrderUser AS 采购订单号填写人,
        o.customerName AS 客户姓名, o.customerPhone AS 客户电话, o.address AS 收货地址,
        o.status AS 订单状态, oi.productName AS 商品名称, oi.productSku AS SKU规格, oi.quantity AS 数量,
        sh.carrier AS 快递公司, sh.trackingNo AS 发货单号, sh.shippedAt AS 发货时间, o.note AS 备注
       FROM orders o
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN shipments sh ON sh.orderId = o.id
       LEFT JOIN suppliers orderSupplier ON orderSupplier.id = o.supplierId
       ORDER BY o.id DESC`
    )
    .all();
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "订单导出");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent("订单导出.xlsx"));
  res.send(buffer);
});

ordersRouter.get("/shipping-export", async (req, res) => {
  const XLSX = (await import("xlsx")).default;
  const status = String(req.query.status ?? "").trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (status) {
    filters.push("o.status = ?");
    params.push(status);
  }
  const rows = getDb()
    .prepare(
      `SELECT COALESCE(shipSupplier.shortName, shipSupplier.name, orderSupplier.shortName, orderSupplier.name) AS 供应商,
        o.storeName AS 店铺, o.orderNo AS 订单编号, o.customerName AS 客户姓名, o.customerPhone AS 电话,
        o.address AS 地址, GROUP_CONCAT(DISTINCT p.series) AS 系列, GROUP_CONCAT(DISTINCT oi.productSku) AS SKU,
        GROUP_CONCAT(DISTINCT oi.productName) AS 名称, GROUP_CONCAT(DISTINCT p.supplierModel) AS 供应商型号,
        SUM(oi.quantity) AS 数量,
        CASE o.status
          WHEN 'pending' THEN '待发货'
          WHEN 'filled' THEN '已填单号'
          WHEN 'purchased' THEN '已下采购单'
          WHEN 'shipped' THEN '已发货'
          WHEN 'exception' THEN '异常'
          WHEN 'cancelled' THEN '已取消'
          ELSE o.status
        END AS 状态,
        latest.carrier AS 快递公司, latest.trackingNo AS 发货单号, latest.shippedAt AS 发货时间,
        o.note AS 备注
       FROM orders o
       LEFT JOIN order_items oi ON oi.orderId = o.id
       LEFT JOIN products p ON p.id = oi.productId
       LEFT JOIN shipments latest ON latest.id = (
         SELECT sh.id FROM shipments sh WHERE sh.orderId = o.id ORDER BY sh.id DESC LIMIT 1
       )
       LEFT JOIN suppliers shipSupplier ON shipSupplier.id = latest.supplierId
       LEFT JOIN suppliers orderSupplier ON orderSupplier.id = o.supplierId
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       GROUP BY o.id
       ORDER BY o.id DESC`
    )
    .all(...params);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "发货安排");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename*=UTF-8''" + encodeURIComponent("发货安排导出.xlsx"));
  res.send(buffer);
});

ordersRouter.get("/:id", (req, res) => {
  const order = readOrder(Number(req.params.id));
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  res.json(order);
});

ordersRouter.post("/", (req, res) => {
  const parsed = orderSchema.safeParse({ ...req.body, registrarName: req.body?.registrarName || req.session.user?.username || "" });
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  try {
    const order = saveOrder(parsed.data) as Record<string, unknown> | null;
    void notifyBusinessAction({
      action: parsed.data.orderType === "accessory" ? "配件登记" : "登记代发",
      operator: req.session.user?.username,
      order
    });
    res.status(201).json(order);
  } catch (error) {
    res.status(409).json({ message: error instanceof Error && error.message === "NOT_FOUND" ? "订单不存在" : "订单号已存在" });
  }
});

ordersRouter.put("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有孙立柱可以操作" });
    return;
  }
  const parsed = orderSchema.safeParse({ ...req.body, registrarName: req.body?.registrarName || req.session.user?.username || "" });
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  try {
    const orderId = Number(req.params.id);
    const result = saveOrder(parsed.data, orderId);
    logOrderEvent(orderId, "修改订单", "修改订单基础信息", req.session.user?.username);
    void notifyBusinessAction({ action: "修改订单", operator: req.session.user?.username, order: result as Record<string, unknown> });
    res.json(result);
  } catch (error) {
    const isNotFound = error instanceof Error && error.message === "NOT_FOUND";
    res.status(isNotFound ? 404 : 409).json({ message: isNotFound ? "订单不存在" : "订单号已存在" });
  }
});

ordersRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有孙立柱可以操作" });
    return;
  }
  const order = readOrder(Number(req.params.id)) as Record<string, unknown> | null;
  const result = getDb().prepare("DELETE FROM orders WHERE id = ?").run(Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  void notifyBusinessAction({ action: "删除订单", operator: req.session.user?.username, order });
  res.json({ ok: true });
});

ordersRouter.patch("/:id/purchase-order", (req, res) => {
  const parsed = purchaseOrderSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const orderId = Number(req.params.id);
  const existing = getDb().prepare("SELECT purchaseOrderNo FROM orders WHERE id = ?").get(orderId) as { purchaseOrderNo?: string | null } | undefined;
  if (!existing) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  if (existing.purchaseOrderNo) {
    getDb()
      .prepare("UPDATE orders SET purchaseOrderNo = ?, status = 'purchased', updatedAt = ? WHERE id = ?")
      .run(parsed.data.purchaseOrderNo, nowIso(), orderId);
    const order = readOrder(orderId) as Record<string, unknown> | null;
    void notifyBusinessAction({
      action: "修改采购订单号",
      operator: req.session.user?.username,
      order,
      fields: [{ label: "填写内容", value: parsed.data.purchaseOrderNo }]
    });
    res.json(order);
    return;
  }
  const result = getDb()
    .prepare("UPDATE orders SET purchaseOrderNo = ?, purchaseOrderUser = ?, status = 'purchased', updatedAt = ? WHERE id = ?")
    .run(parsed.data.purchaseOrderNo, parsed.data.purchaseOrderUser || req.session.user?.username || "", nowIso(), orderId);
  if (result.changes === 0) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const order = readOrder(orderId) as Record<string, unknown> | null;
  void notifyBusinessAction({
    action: "填写采购订单号",
    operator: req.session.user?.username,
    order,
    fields: [{ label: "填写内容", value: parsed.data.purchaseOrderNo }]
  });
  res.json(order);
});

ordersRouter.delete("/:id/purchase-order", (req, res) => {
  const orderId = Number(req.params.id);
  const result = getDb()
    .prepare("UPDATE orders SET purchaseOrderNo = '', purchaseOrderUser = '', status = CASE WHEN status = 'purchased' THEN 'pending' ELSE status END, updatedAt = ? WHERE id = ?")
    .run(nowIso(), orderId);
  if (result.changes === 0) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const order = readOrder(orderId) as Record<string, unknown> | null;
  void notifyBusinessAction({ action: "删除采购订单号", operator: req.session.user?.username, order });
  res.json(order);
});

ordersRouter.patch("/:id/status", (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const orderId = Number(req.params.id);
  const existing = getDb().prepare("SELECT status FROM orders WHERE id = ?").get(orderId) as { status: string } | undefined;
  const result = getDb()
    .prepare("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?")
    .run(parsed.data.status, nowIso(), orderId);
  if (result.changes === 0) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const action = parsed.data.status === "shipped" ? "已提货" : parsed.data.status === "filled" ? "未发走" : "状态变更";
  logOrderEvent(orderId, action, `${statusText[existing?.status ?? ""] ?? existing?.status ?? "-"} -> ${statusText[parsed.data.status]}`, req.session.user?.username);
  const order = readOrder(orderId) as Record<string, unknown> | null;
  void notifyBusinessAction({
    action,
    operator: req.session.user?.username,
    order,
    fields: [{ label: "状态变化", value: `${statusText[existing?.status ?? ""] ?? existing?.status ?? "-"} -> ${statusText[parsed.data.status]}` }]
  });
  res.json(order);
});

ordersRouter.patch("/:id/shipping-edit", (req, res) => {
  const parsed = shippingEditSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  const orderId = Number(req.params.id);
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(orderId);
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const currentItem = db.prepare("SELECT * FROM order_items WHERE orderId = ? ORDER BY id LIMIT 1").get(orderId) as
    | { productName: string; productSku: string; quantity: number }
    | undefined;
  const product = parsed.data.productId
    ? (db.prepare("SELECT * FROM products WHERE id = ?").get(parsed.data.productId) as
        | { id: number; name: string; ssku?: string | null; sku: string; costPrice?: number; salePrice?: number; supplierId?: number | null }
        | undefined)
    : undefined;
  if (parsed.data.productId && !product) {
    res.status(400).json({ message: "商品不存在" });
    return;
  }
  const productName = product?.name ?? parsed.data.productName;
  const productSku = product?.ssku || product?.sku || parsed.data.productSku;
  const supplierId = parsed.data.supplierId ?? product?.supplierId ?? null;
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET supplierId = ?, note = ?, updatedAt = ? WHERE id = ?").run(supplierId, parsed.data.note, nowIso(), orderId);
    db.prepare("DELETE FROM order_items WHERE orderId = ?").run(orderId);
    db.prepare(
      "INSERT INTO order_items (orderId, productId, productName, productSku, quantity, unitCost, unitSalePrice) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(orderId, product?.id ?? parsed.data.productId ?? null, productName, productSku, parsed.data.quantity, product?.costPrice ?? 0, product?.salePrice ?? 0);
    logOrderEvent(
      orderId,
      "发货安排修改",
      `${currentItem?.productName ?? "-"} / ${currentItem?.productSku ?? "-"} / ${currentItem?.quantity ?? 0} -> ${productName} / ${productSku} / ${parsed.data.quantity}`,
      req.session.user?.username
    );
  });
  tx();
  const updated = readOrder(orderId) as Record<string, unknown> | null;
  void notifyBusinessAction({
    action: "发货安排修改",
    operator: req.session.user?.username,
    order: updated,
    fields: [{ label: "填写内容", value: `${productName} / ${productSku} / 数量${parsed.data.quantity}` }]
  });
  res.json(updated);
});

ordersRouter.post("/:id/ship", (req, res) => {
  const parsed = shipSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  const id = Number(req.params.id);
  const order = db.prepare("SELECT id, supplierId FROM orders WHERE id = ?").get(id) as { id: number; supplierId?: number | null } | undefined;
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const carrier = parsed.data.carrierId
    ? (db.prepare("SELECT name FROM carriers WHERE id = ?").get(parsed.data.carrierId) as { name: string } | undefined)
    : undefined;
  if (parsed.data.carrierId && !carrier) {
    res.status(400).json({ message: "快递公司不存在" });
    return;
  }
  const supplierId = parsed.data.supplierId ?? order.supplierId ?? null;
  const carrierName = carrier?.name ?? parsed.data.carrier;
  db.prepare(
    "INSERT INTO shipments (orderId, supplierId, carrierId, carrier, trackingNo, shippedAt, status, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, supplierId, parsed.data.carrierId ?? null, carrierName, parsed.data.trackingNo, parsed.data.shippedAt, parsed.data.status, parsed.data.note);
  db.prepare("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?").run(parsed.data.status, nowIso(), id);
  logOrderEvent(id, "填写发货单号", `${carrierName} ${parsed.data.trackingNo}`, req.session.user?.username);
  const updated = readOrder(id) as Record<string, unknown> | null;
  void notifyBusinessAction({
    action: parsed.data.status === "shipped" ? "配件发货" : "填写发货单号",
    operator: req.session.user?.username,
    order: updated,
    fields: [
      { label: "填写快递公司", value: carrierName },
      { label: "填写发货单号", value: parsed.data.trackingNo },
      { label: "发货时间", value: parsed.data.shippedAt }
    ]
  });
  res.json(updated);
});

ordersRouter.delete("/:id/shipment", (req, res) => {
  const db = getDb();
  const id = Number(req.params.id);
  const order = db.prepare("SELECT id FROM orders WHERE id = ?").get(id);
  if (!order) {
    res.status(404).json({ message: "订单不存在" });
    return;
  }
  const latest = db.prepare("SELECT id FROM shipments WHERE orderId = ? ORDER BY id DESC LIMIT 1").get(id) as { id: number } | undefined;
  if (!latest) {
    res.status(404).json({ message: "没有可删除的发货单号" });
    return;
  }
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM shipments WHERE id = ?").run(latest.id);
    const remaining = db
      .prepare("SELECT status FROM shipments WHERE orderId = ? ORDER BY id DESC LIMIT 1")
      .get(id) as { status: string } | undefined;
    db.prepare("UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?").run(remaining?.status ?? "pending", nowIso(), id);
  });
  tx();
  void notifyBusinessAction({
    action: "删除发货单号",
    operator: req.session.user?.username,
    order: readOrder(id) as Record<string, unknown> | null
  });
  res.json(readOrder(id));
});

ordersRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }
  const XLSX = (await import("xlsx")).default;
  const db = getDb();
  const workbook = XLSX.readFile(req.file.path);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const errors: Array<{ row: number; message: string }> = [];
  const parsedOrders = rows.map((row, index) => {
    const productName = String(row["商品名称"] ?? "").trim();
    const productSku = String(row["SKU规格"] ?? row["SKU"] ?? "").trim();
    const supplierName = String(row["供应商"] ?? row["供应商名称"] ?? "").trim();
    const supplier = supplierName
      ? (db.prepare("SELECT id FROM suppliers WHERE name = ? OR shortName = ?").get(supplierName, supplierName) as { id: number } | undefined)
      : undefined;
    const product = db.prepare("SELECT * FROM products WHERE name = ? AND (sku = ? OR ssku = ?)").get(productName, productSku, productSku) as
      | { id: number; costPrice: number; salePrice: number }
      | undefined;
    const payload = {
      orderNo: String(row["订单号"] ?? "").trim(),
      purchaseOrderNo: String(row["采购订单号"] ?? row["采购单号"] ?? "").trim(),
      supplierId: supplier?.id ?? null,
      storeName: String(row["店铺"] ?? row["店铺名称"] ?? "").trim(),
      registrarName: String(row["登记人"] ?? req.session.user?.username ?? "").trim(),
      customerName: String(row["客户姓名"] ?? "").trim(),
      customerPhone: String(row["客户电话"] ?? "").trim(),
      address: String(row["收货地址"] ?? "").trim(),
      status: "pending" as const,
      note: String(row["备注"] ?? "").trim(),
      items: [
        {
          productId: product?.id,
          productName,
          productSku,
          quantity: Number(row["数量"] ?? 0),
          unitCost: product?.costPrice ?? 0,
          unitSalePrice: product?.salePrice ?? 0
        }
      ]
    };
    const parsed = orderSchema.safeParse(payload);
    if (!parsed.success) {
      errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "参数错误" });
      return null;
    }
    if (!product) {
      errors.push({ row: index + 2, message: `未找到商品：${productName}/${productSku}` });
      return null;
    }
    if (supplierName && !supplier) {
      errors.push({ row: index + 2, message: `未找到供应商：${supplierName}` });
      return null;
    }
    return parsed.data;
  });

  if (errors.length) {
    db.prepare(
      "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("orders", req.file.originalname, rows.length, 0, errors.length, JSON.stringify(errors));
    fs.unlink(req.file.path, () => undefined);
    res.status(400).json({ message: "导入文件存在错误，未写入数据", errors });
    return;
  }

  const tx = db.transaction(() => {
    for (const order of parsedOrders) {
      if (order) saveOrder(order);
    }
    db.prepare(
      "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
    ).run("orders", req.file!.originalname, rows.length, rows.length, 0, "[]");
  });
  try {
    tx();
    void notifyBusinessAction({
      action: "批量导入代发单",
      operator: req.session.user?.username,
      fields: [
        { label: "文件名", value: req.file.originalname },
        { label: "成功行数", value: rows.length }
      ]
    });
    res.json({ totalRows: rows.length, successRows: rows.length, failedRows: 0 });
  } catch {
    res.status(409).json({ message: "导入失败，请检查是否存在重复订单号" });
  } finally {
    fs.unlink(req.file.path, () => undefined);
  }
});
