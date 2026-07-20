import { Router } from "express";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { notifyDingtalk, notifyFeishu } from "../notifications/dingtalk.js";
import { ROLE_ADMIN } from "../permissions.js";

export const repairsRouter = Router();

const createSchema = z.object({
  storeOrderNo: z.string().trim().min(1, "原店铺订单号不能为空"),
  customerName: z.string().optional().default(""),
  customerPhone: z.string().optional().default(""),
  customerAddress: z.string().optional().default(""),
  storeName: z.string().optional().default(""),
  series: z.string().optional().default(""),
  sku: z.string().optional().default(""),
  name: z.string().optional().default(""),
  carrierCompany: z.string().optional().default(""),
  trackingNo: z.string().optional().default(""),
  note: z.string().optional().default(""),
  action: z.string().optional().default("")
});

const updateSchema = z.object({
  storeOrderNo: z.string().optional(),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  customerAddress: z.string().optional(),
  storeName: z.string().optional(),
  series: z.string().optional(),
  sku: z.string().optional(),
  name: z.string().optional(),
  carrierCompany: z.string().optional(),
  trackingNo: z.string().optional(),
  note: z.string().optional(),
  action: z.string().optional(),
  isCompleted: z.number().int().min(0).max(1).optional(),
  isReceived: z.number().int().min(0).max(1).optional(),
  estimatedCompletion: z.string().optional(),
  returnCarrier: z.string().optional(),
  returnTrackingNo: z.string().optional(),
  supplierFeedback: z.string().optional()
});

function deriveStatus(current: Record<string, unknown>, updates: Record<string, unknown>): string {
  const isCompleted = updates.isCompleted !== undefined ? Number(updates.isCompleted) : Number(current.isCompleted ?? 0);
  const isReceived = updates.isReceived !== undefined ? Number(updates.isReceived) : Number(current.isReceived ?? 0);
  const estimatedCompletion = updates.estimatedCompletion !== undefined ? String(updates.estimatedCompletion) : String(current.estimatedCompletion ?? "");
  const returnTrackingNo = updates.returnTrackingNo !== undefined ? String(updates.returnTrackingNo) : String(current.returnTrackingNo ?? "");

  if (isCompleted === 1) return "完结";
  if (returnTrackingNo.trim()) return "供应商已寄出";
  if (estimatedCompletion.trim()) return "已反馈时间";
  if (isReceived === 1) return "已收到";
  return "顾客寄出";
}

function valueText(value: unknown): string {
  if (value === undefined || value === null || value === "") return "-";
  return String(value).trim() || "-";
}

function buildRepairText(row: Record<string, unknown>, action: string, operator?: string): string {
  const fields = [
    { label: "操作人", value: operator },
    { label: "操作", value: action },
    { label: "店铺", value: row.storeName },
    { label: "原店铺订单号", value: row.storeOrderNo },
    { label: "客户", value: row.customerName },
    { label: "电话", value: row.customerPhone },
    { label: "地址", value: row.customerAddress },
    { label: "系列", value: row.series },
    { label: "SKU", value: row.sku },
    { label: "名称", value: row.name },
    { label: "快递公司", value: row.carrierCompany },
    { label: "快递单号", value: row.trackingNo },
    { label: "操作", value: row.action },
    { label: "备注", value: row.note },
    { label: "是否已收到货", value: row.isReceived ? "已收到" : "未收到" },
    { label: "预计完成时间", value: row.estimatedCompletion },
    { label: "寄出快递公司", value: row.returnCarrier },
    { label: "寄出快递单号", value: row.returnTrackingNo },
    { label: "供应商反馈", value: row.supplierFeedback },
    { label: "状态", value: row.status }
  ].filter((field) => valueText(field.value) !== "-");

  return [`### 一件代发系统：${action}`, "", ...fields.map((field) => `- **${field.label}**：${valueText(field.value)}`)].join("\n");
}

repairsRouter.get("/", (_req, res) => {
  const rows = getDb()
    .prepare("SELECT * FROM repair_exchanges ORDER BY id DESC")
    .all() as Record<string, unknown>[];
  res.json(rows);
});

repairsRouter.post("/", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  const result = db
    .prepare(
      `INSERT INTO repair_exchanges
       (storeOrderNo, customerName, customerPhone, customerAddress, storeName, series, sku, name, carrierCompany, trackingNo, note, action, status, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '顾客寄出', ?)`
    )
    .run(
      parsed.data.storeOrderNo,
      parsed.data.customerName,
      parsed.data.customerPhone,
      parsed.data.customerAddress,
      parsed.data.storeName,
      parsed.data.series,
      parsed.data.sku,
      parsed.data.name,
      parsed.data.carrierCompany,
      parsed.data.trackingNo,
      parsed.data.note,
      parsed.data.action,
      nowIso()
    );
  const row = db.prepare("SELECT * FROM repair_exchanges WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
  const title = "一件代发系统：维修换货登记";
  const text = buildRepairText(row, "维修换货登记", req.session.user?.username);
  void notifyFeishu(title, text);
  res.status(201).json(row);
});

repairsRouter.patch("/:id", (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  const current = getDb().prepare("SELECT * FROM repair_exchanges WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ message: "记录不存在" });
    return;
  }

  const newStatus = deriveStatus(current, parsed.data as Record<string, unknown>);
  const sets: string[] = ["status = ?", "updatedAt = ?"];
  const params: unknown[] = [newStatus, nowIso()];

  const fields = [
    "storeOrderNo", "customerName", "customerPhone", "customerAddress", "storeName", "series", "sku", "name",
    "carrierCompany", "trackingNo", "note", "action", "isCompleted", "isReceived", "estimatedCompletion",
    "returnCarrier", "returnTrackingNo", "supplierFeedback"
  ] as const;
  for (const field of fields) {
    const val = parsed.data[field];
    if (val !== undefined) {
      sets.push(`${field} = ?`);
      params.push(val);
    }
  }

  params.push(id);
  getDb().prepare(`UPDATE repair_exchanges SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const row = getDb().prepare("SELECT * FROM repair_exchanges WHERE id = ?").get(id) as Record<string, unknown>;

  const hasFeedbackChange =
    parsed.data.isReceived !== undefined ||
    parsed.data.estimatedCompletion !== undefined ||
    parsed.data.returnCarrier !== undefined ||
    parsed.data.returnTrackingNo !== undefined ||
    parsed.data.supplierFeedback !== undefined;

  if (hasFeedbackChange) {
    const title = "一件代发系统：维修换货反馈";
    const text = buildRepairText(row, "维修换货反馈", req.session.user?.username);
    void notifyDingtalk(title, text, config.repairDingtalkWebhook, config.repairDingtalkSecret, "维修换货钉钉通知");
  } else {
    const title = "一件代发系统：维修换货登记变更";
    const text = buildRepairText(row, "维修换货登记变更", req.session.user?.username);
    void notifyFeishu(title, text);
  }

  res.json(row);
});

repairsRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const id = Number(req.params.id);
  const result = getDb().prepare("DELETE FROM repair_exchanges WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "记录不存在" });
    return;
  }
  res.json({ ok: true });
});
