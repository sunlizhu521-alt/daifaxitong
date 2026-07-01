import { Router } from "express";
import { z } from "zod";
import { getDb, nowIso } from "../db/index.js";

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1, "供应商名称不能为空"),
  contact: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  address: z.string().optional().default(""),
  settlementType: z.string().optional().default(""),
  note: z.string().optional().default("")
});

suppliersRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const db = getDb();
  const rows = keyword
    ? db
        .prepare("SELECT * FROM suppliers WHERE name LIKE ? OR contact LIKE ? OR phone LIKE ? ORDER BY id DESC")
        .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    : db.prepare("SELECT * FROM suppliers ORDER BY id DESC").all();
  res.json(rows);
});

suppliersRouter.post("/", (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare(
        "INSERT INTO suppliers (name, contact, phone, address, settlementType, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        parsed.data.name,
        parsed.data.contact,
        parsed.data.phone,
        parsed.data.address,
        parsed.data.settlementType,
        parsed.data.note,
        nowIso()
      );
    res.status(201).json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ message: "供应商名称已存在" });
  }
});

suppliersRouter.put("/:id", (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  const db = getDb();
  try {
    const result = db
      .prepare(
        "UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, settlementType = ?, note = ?, updatedAt = ? WHERE id = ?"
      )
      .run(
        parsed.data.name,
        parsed.data.contact,
        parsed.data.phone,
        parsed.data.address,
        parsed.data.settlementType,
        parsed.data.note,
        nowIso(),
        id
      );
    if (result.changes === 0) {
      res.status(404).json({ message: "供应商不存在" });
      return;
    }
    res.json(db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id));
  } catch {
    res.status(409).json({ message: "供应商名称已存在" });
  }
});

suppliersRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const usedByProducts = db.prepare("SELECT COUNT(*) AS count FROM products WHERE supplierId = ?").get(id) as { count: number };
  const usedByShipments = db.prepare("SELECT COUNT(*) AS count FROM shipments WHERE supplierId = ?").get(id) as { count: number };
  if (usedByProducts.count > 0 || usedByShipments.count > 0) {
    res.status(409).json({ message: "供应商已被商品或发货记录引用，不能删除" });
    return;
  }
  const result = db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "供应商不存在" });
    return;
  }
  res.json({ ok: true });
});
