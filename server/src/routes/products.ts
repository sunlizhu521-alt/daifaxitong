import { Router } from "express";
import { z } from "zod";
import { getDb, nowIso } from "../db/index.js";

export const productsRouter = Router();

const optionalId = z.preprocess((value) => (value === "" || value === undefined ? null : value), z.coerce.number().int().positive().nullable());

const productSchema = z.object({
  name: z.string().trim().min(1, "商品名称不能为空"),
  sku: z.string().trim().min(1, "SKU/规格不能为空"),
  costPrice: z.coerce.number().min(0).default(0),
  salePrice: z.coerce.number().min(0).default(0),
  supplierId: optionalId,
  status: z.enum(["active", "inactive"]).default("active"),
  note: z.string().optional().default("")
});

const baseSelect = `
  SELECT p.*, s.name AS supplierName
  FROM products p
  LEFT JOIN suppliers s ON s.id = p.supplierId
`;

productsRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    filters.push("(p.name LIKE ? OR p.sku LIKE ? OR s.name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  if (status) {
    filters.push("p.status = ?");
    params.push(status);
  }
  const sql = `${baseSelect}${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""} ORDER BY p.id DESC`;
  res.json(getDb().prepare(sql).all(...params));
});

productsRouter.post("/", (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare(
        "INSERT INTO products (name, sku, costPrice, salePrice, supplierId, status, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        parsed.data.name,
        parsed.data.sku,
        parsed.data.costPrice,
        parsed.data.salePrice,
        parsed.data.supplierId ?? null,
        parsed.data.status,
        parsed.data.note,
        nowIso()
      );
    res.status(201).json(db.prepare(`${baseSelect} WHERE p.id = ?`).get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ message: "商品名称和 SKU 已存在" });
  }
});

productsRouter.put("/:id", (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  const db = getDb();
  try {
    const result = db
      .prepare(
        "UPDATE products SET name = ?, sku = ?, costPrice = ?, salePrice = ?, supplierId = ?, status = ?, note = ?, updatedAt = ? WHERE id = ?"
      )
      .run(
        parsed.data.name,
        parsed.data.sku,
        parsed.data.costPrice,
        parsed.data.salePrice,
        parsed.data.supplierId ?? null,
        parsed.data.status,
        parsed.data.note,
        nowIso(),
        id
      );
    if (result.changes === 0) {
      res.status(404).json({ message: "商品不存在" });
      return;
    }
    res.json(db.prepare(`${baseSelect} WHERE p.id = ?`).get(id));
  } catch {
    res.status(409).json({ message: "商品名称和 SKU 已存在" });
  }
});

productsRouter.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  const db = getDb();
  const used = db.prepare("SELECT COUNT(*) AS count FROM order_items WHERE productId = ?").get(id) as { count: number };
  if (used.count > 0) {
    res.status(409).json({ message: "商品已被订单引用，不能删除" });
    return;
  }
  const result = db.prepare("DELETE FROM products WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "商品不存在" });
    return;
  }
  res.json({ ok: true });
});
