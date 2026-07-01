import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import XLSX from "xlsx";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { ROLE_ADMIN } from "../permissions.js";

export const productsRouter = Router();
const upload = multer({ dest: config.uploadDir });

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

function cell(row: Record<string, unknown>, names: string[]) {
  for (const name of names) {
    const value = row[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function parseStatus(value: string) {
  if (["停用", "下架", "inactive"].includes(value)) return "inactive";
  return "active";
}

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

productsRouter.post("/import", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }
  const db = getDb();
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const errors: Array<{ row: number; message: string }> = [];
    const seen = new Set<string>();
    const parsedRows = rows.map((row, index) => {
      const supplierName = cell(row, ["供应商", "供应商名称", "supplierName"]);
      const supplier = supplierName
        ? (db.prepare("SELECT id FROM suppliers WHERE name = ?").get(supplierName) as { id: number } | undefined)
        : undefined;
      if (supplierName && !supplier) {
        errors.push({ row: index + 2, message: `未找到供应商：${supplierName}` });
        return null;
      }
      const payload = {
        name: cell(row, ["商品名称", "商品", "名称", "name"]),
        sku: cell(row, ["SKU规格", "SKU/规格", "SKU", "规格", "sku"]),
        costPrice: cell(row, ["成本价", "成本", "costPrice"]) || 0,
        salePrice: cell(row, ["建议售价", "售价", "salePrice"]) || 0,
        supplierId: supplier?.id ?? null,
        status: parseStatus(cell(row, ["状态", "status"])),
        note: cell(row, ["备注", "note"])
      };
      const parsed = productSchema.safeParse(payload);
      if (!parsed.success) {
        errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "参数错误" });
        return null;
      }
      const uniqueKey = `${parsed.data.name}__${parsed.data.sku}`;
      if (seen.has(uniqueKey)) {
        errors.push({ row: index + 2, message: `商品重复：${parsed.data.name}/${parsed.data.sku}` });
        return null;
      }
      seen.add(uniqueKey);
      const exists = db.prepare("SELECT id FROM products WHERE name = ? AND sku = ?").get(parsed.data.name, parsed.data.sku);
      if (exists) {
        errors.push({ row: index + 2, message: `商品已存在：${parsed.data.name}/${parsed.data.sku}` });
        return null;
      }
      return parsed.data;
    });

    if (!rows.length) errors.push({ row: 1, message: "导入文件没有数据" });
    if (errors.length) {
      res.status(400).json({ message: "导入文件存在错误，未写入数据", errors });
      return;
    }

    const insert = db.prepare(
      "INSERT INTO products (name, sku, costPrice, salePrice, supplierId, status, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (const row of parsedRows) {
        if (row) {
          insert.run(row.name, row.sku, row.costPrice, row.salePrice, row.supplierId ?? null, row.status, row.note, nowIso());
        }
      }
      db.prepare(
        "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("products", req.file!.originalname, rows.length, rows.length, 0, "[]");
    });
    tx();
    res.json({ totalRows: rows.length, successRows: rows.length, failedRows: 0 });
  } finally {
    fs.unlink(req.file.path, () => undefined);
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
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
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
