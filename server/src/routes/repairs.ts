import { Router } from "express";
import { z } from "zod";
import { getDb, nowIso } from "../db/index.js";
import { ROLE_ADMIN } from "../permissions.js";

export const repairsRouter = Router();

const createSchema = z.object({
  storeOrderNo: z.string().trim().min(1, "原店铺订单号不能为空"),
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
       (storeOrderNo, series, sku, name, carrierCompany, trackingNo, note, action, status, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '顾客寄出', ?)`
    )
    .run(
      parsed.data.storeOrderNo,
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

  const fields: (keyof typeof parsed.data)[] = [
    "storeOrderNo",
    "series",
    "sku",
    "name",
    "carrierCompany",
    "trackingNo",
    "note",
    "action",
    "isCompleted",
    "isReceived",
    "estimatedCompletion",
    "returnCarrier",
    "returnTrackingNo",
    "supplierFeedback"
  ];
  for (const field of fields) {
    const val = parsed.data[field as keyof typeof parsed.data];
    if (val !== undefined) {
      sets.push(`${field} = ?`);
      params.push(val);
    }
  }

  params.push(id);
  getDb().prepare(`UPDATE repair_exchanges SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  const row = getDb().prepare("SELECT * FROM repair_exchanges WHERE id = ?").get(id) as Record<string, unknown>;
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
