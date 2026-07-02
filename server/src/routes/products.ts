import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { ROLE_ADMIN } from "../permissions.js";

export const productsRouter = Router();
const upload = multer({ dest: config.uploadDir });

const optionalId = z.preprocess((value) => (value === "" || value === undefined ? null : value), z.coerce.number().int().positive().nullable());

const productSchema = z.object({
  materialCode: z.string().trim().min(1, "物料编码不能为空"),
  productLine: z.string().optional().default(""),
  series: z.string().optional().default(""),
  ssku: z.string().trim().min(1, "SKU不能为空"),
  name: z.string().trim().min(1, "名称不能为空"),
  supplierModel: z.string().optional().default(""),
  supplierId: optionalId,
  note: z.string().optional().default("")
});

function cell(row: Record<string, unknown>, names: string[]) {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value])
  );
  for (const name of names) {
    const value = row[name] ?? normalized.get(normalizeHeader(name));
    if (value !== undefined && value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").replace(/[\s/_\-（）()：:]/g, "").toLowerCase();
}

const baseSelect = `
  SELECT p.*, COALESCE(p.ssku, p.sku) AS ssku, s.name AS supplierName
  FROM products p
  LEFT JOIN suppliers s ON s.id = p.supplierId
`;

productsRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const filters: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    filters.push("(p.materialCode LIKE ? OR p.productLine LIKE ? OR p.series LIKE ? OR p.ssku LIKE ? OR p.sku LIKE ? OR p.name LIKE ? OR p.supplierModel LIKE ? OR s.name LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
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
        `INSERT INTO products
         (materialCode, productLine, series, ssku, name, sku, supplierModel, costPrice, salePrice, supplierId, status, note, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?)`
      )
      .run(
        parsed.data.materialCode,
        parsed.data.productLine,
        parsed.data.series,
        parsed.data.ssku,
        parsed.data.name,
        parsed.data.ssku,
        parsed.data.supplierModel,
        parsed.data.supplierId ?? null,
        parsed.data.note,
        nowIso()
      );
    res.status(201).json(db.prepare(`${baseSelect} WHERE p.id = ?`).get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ message: "商品名称和 SKU 已存在" });
  }
});

productsRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }
  const XLSX = (await import("xlsx")).default;
  const db = getDb();
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const rows = rawRows
      .map((row, index) => ({ row, rowNumber: index + 2 }))
      .filter(({ row }) => Object.values(row).some((value) => String(value).trim() !== ""));
    const errors: Array<{ row: number; message: string }> = [];
    const parsedMap = new Map<string, z.infer<typeof productSchema>>();
    for (const { row, rowNumber } of rows) {
      const supplierName = cell(row, ["供应商", "供应商名称", "供应商简称", "supplierName"]);
      const supplier = supplierName
        ? (db.prepare("SELECT id FROM suppliers WHERE name = ? OR shortName = ?").get(supplierName, supplierName) as { id: number } | undefined)
        : undefined;
      const sku = cell(row, ["SKU", "sSKU", "SSKU", "sku", "规格", "型号", "商品型号"]);
      const supplierModel = cell(row, ["供应商型号", "供应商货号", "供方型号", "supplierModel"]);
      const payload = {
        materialCode: cell(row, ["物料编码", "物料编号", "商品编码", "编码", "materialCode"]) || sku || supplierModel,
        productLine: cell(row, ["产品线", "品线", "productLine"]),
        series: cell(row, ["系列", "series"]),
        ssku: sku || supplierModel,
        name: cell(row, ["名称", "商品名称", "产品名称", "品名", "name"]),
        supplierModel,
        supplierId: supplier?.id ?? null,
        note: cell(row, ["备注", "note"])
      };
      const parsed = productSchema.safeParse(payload);
      if (!parsed.success) {
        errors.push({ row: rowNumber, message: parsed.error.issues[0]?.message ?? "参数错误" });
        continue;
      }
      const uniqueKey = `${parsed.data.name}__${parsed.data.ssku}`;
      parsedMap.set(uniqueKey, parsed.data);
    }
    const parsedRows = [...parsedMap.values()];

    if (!rows.length) errors.push({ row: 1, message: "导入文件没有数据" });
    if (errors.length) {
      res.status(400).json({ message: "导入文件存在错误，未写入数据", errors });
      return;
    }

    const insert = db.prepare(
      `INSERT INTO products
       (materialCode, productLine, series, ssku, name, sku, supplierModel, costPrice, salePrice, supplierId, status, note, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 'active', ?, ?)`
    );
    const update = db.prepare(
      `UPDATE products
       SET materialCode = ?, productLine = ?, series = ?, ssku = ?, name = ?, sku = ?, supplierModel = ?, supplierId = ?, note = ?, updatedAt = ?
       WHERE id = ?`
    );
    const findByNameSku = db.prepare("SELECT id FROM products WHERE name = ? AND sku = ?");
    const findByMaterialCode = db.prepare("SELECT id FROM products WHERE materialCode = ?");
    const tx = db.transaction(() => {
      for (const row of parsedRows) {
        const existing = (findByNameSku.get(row.name, row.ssku) || findByMaterialCode.get(row.materialCode)) as { id: number } | undefined;
        if (existing) {
          update.run(
            row.materialCode,
            row.productLine,
            row.series,
            row.ssku,
            row.name,
            row.ssku,
            row.supplierModel,
            row.supplierId ?? null,
            row.note,
            nowIso(),
            existing.id
          );
        } else {
          insert.run(
            row.materialCode,
            row.productLine,
            row.series,
            row.ssku,
            row.name,
            row.ssku,
            row.supplierModel,
            row.supplierId ?? null,
            row.note,
            nowIso()
          );
        }
      }
      db.prepare(
        "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("products", req.file!.originalname, rows.length, parsedRows.length, 0, "[]");
    });
    tx();
    res.json({ totalRows: rows.length, successRows: parsedRows.length, failedRows: 0 });
  } catch {
    if (!res.headersSent) {
      res.status(400).json({ message: "Excel 解析失败，请确认文件是 .xlsx/.xls 格式且第一行是表头" });
    }
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
        `UPDATE products
         SET materialCode = ?, productLine = ?, series = ?, ssku = ?, name = ?, sku = ?, supplierModel = ?, supplierId = ?, note = ?, updatedAt = ?
         WHERE id = ?`
      )
      .run(
        parsed.data.materialCode,
        parsed.data.productLine,
        parsed.data.series,
        parsed.data.ssku,
        parsed.data.name,
        parsed.data.ssku,
        parsed.data.supplierModel,
        parsed.data.supplierId ?? null,
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
