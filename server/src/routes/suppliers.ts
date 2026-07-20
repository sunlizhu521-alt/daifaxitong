import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { getDb, nowIso } from "../db/index.js";
import { notifyBusinessAction } from "../notifications/dingtalk.js";
import { ROLE_ADMIN } from "../permissions.js";
import { excelUpload as upload } from "../uploads.js";
import { cell, normalizeHeader } from "../utils.js";

export const suppliersRouter = Router();

const supplierSchema = z.object({
  name: z.string().trim().min(1, "供应商名称不能为空"),
  shortName: z.string().optional().default(""),
  contact: z.string().optional().default(""),
  phone: z.string().optional().default(""),
  storeAddress: z.string().optional().default(""),
  address: z.string().optional().default(""),
  note: z.string().optional().default("")
});

suppliersRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const db = getDb();
  const rows = keyword
    ? db
        .prepare(
          "SELECT * FROM suppliers WHERE name LIKE ? OR shortName LIKE ? OR contact LIKE ? OR phone LIKE ? OR storeAddress LIKE ? OR note LIKE ? ORDER BY id DESC"
        )
        .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
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
        "INSERT INTO suppliers (name, shortName, contact, phone, address, storeAddress, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        parsed.data.name,
        parsed.data.shortName,
        parsed.data.contact,
        parsed.data.phone,
        parsed.data.address,
        parsed.data.storeAddress,
        parsed.data.note,
        nowIso()
      );
    const row = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
    void notifyBusinessAction({
      action: "新增供应商",
      operator: req.session.user?.username,
      fields: [
        { label: "供应商名称", value: row.name },
        { label: "供应商简称", value: row.shortName },
        { label: "联系人", value: row.contact },
        { label: "电话", value: row.phone },
        { label: "店址", value: row.storeAddress },
        { label: "备注", value: row.note }
      ]
    });
    res.status(201).json(row);
  } catch {
    res.status(409).json({ message: "供应商名称已存在" });
  }
});

suppliersRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }
  const db = getDb();
  try {
    const XLSX = (await import("xlsx")).default;
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const errors: Array<{ row: number; message: string }> = [];
    const seen = new Set<string>();
    const parsedRows = rows.map((row, index) => {
      const payload = {
        name: cell(row, ["供应商名称", "供应商", "名称", "name"]),
        shortName: cell(row, ["供应商简称", "简称", "shortName"]),
        contact: cell(row, ["联系人", "contact"]),
        phone: cell(row, ["电话", "手机", "联系电话", "phone"]),
        address: cell(row, ["地址", "address"]),
        storeAddress: cell(row, ["店址", "地址", "storeAddress", "address"]),
        note: cell(row, ["备注", "note"])
      };
      const parsed = supplierSchema.safeParse(payload);
      if (!parsed.success) {
        errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "参数错误" });
        return null;
      }
      if (seen.has(parsed.data.name)) {
        errors.push({ row: index + 2, message: `供应商重复：${parsed.data.name}` });
        return null;
      }
      seen.add(parsed.data.name);
      const exists = db.prepare("SELECT id FROM suppliers WHERE name = ?").get(parsed.data.name);
      if (exists) {
        errors.push({ row: index + 2, message: `供应商已存在：${parsed.data.name}` });
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
      "INSERT INTO suppliers (name, shortName, contact, phone, address, storeAddress, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const tx = db.transaction(() => {
      for (const row of parsedRows) {
        if (row) insert.run(row.name, row.shortName, row.contact, row.phone, row.address, row.storeAddress, row.note, nowIso());
      }
      db.prepare(
        "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("suppliers", req.file!.originalname, rows.length, rows.length, 0, "[]");
    });
    tx.immediate();
    void notifyBusinessAction({
      action: "批量导入供应商",
      operator: req.session.user?.username,
      fields: [
        { label: "文件名", value: req.file.originalname },
        { label: "成功行数", value: rows.length }
      ]
    });
    res.json({ totalRows: rows.length, successRows: rows.length, failedRows: 0 });
  } catch {
    if (!res.headersSent) {
      res.status(400).json({ message: "Excel 解析失败，请确认文件是 .xlsx/.xls 格式且第一行是表头" });
    }
  } finally {
    fs.unlink(req.file.path, () => undefined);
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
      .prepare("UPDATE suppliers SET name = ?, shortName = ?, contact = ?, phone = ?, address = ?, storeAddress = ?, note = ?, updatedAt = ? WHERE id = ?")
      .run(
        parsed.data.name,
        parsed.data.shortName,
        parsed.data.contact,
        parsed.data.phone,
        parsed.data.address,
        parsed.data.storeAddress,
        parsed.data.note,
        nowIso(),
        id
      );
    if (result.changes === 0) {
      res.status(404).json({ message: "供应商不存在" });
      return;
    }
    const row = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as Record<string, unknown>;
    void notifyBusinessAction({
      action: "修改供应商",
      operator: req.session.user?.username,
      fields: [
        { label: "供应商名称", value: row.name },
        { label: "供应商简称", value: row.shortName },
        { label: "联系人", value: row.contact },
        { label: "电话", value: row.phone },
        { label: "店址", value: row.storeAddress },
        { label: "备注", value: row.note }
      ]
    });
    res.json(row);
  } catch {
    res.status(409).json({ message: "供应商名称已存在" });
  }
});

suppliersRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const id = Number(req.params.id);
  const db = getDb();
  const row = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  const usedByProducts = db.prepare("SELECT COUNT(*) AS count FROM products WHERE supplierId = ?").get(id) as { count: number };
  const usedByOrders = db.prepare("SELECT COUNT(*) AS count FROM orders WHERE supplierId = ?").get(id) as { count: number };
  const usedByShipments = db.prepare("SELECT COUNT(*) AS count FROM shipments WHERE supplierId = ?").get(id) as { count: number };
  if (usedByProducts.count > 0 || usedByOrders.count > 0 || usedByShipments.count > 0) {
    res.status(409).json({ message: "供应商已被商品、订单或发货记录引用，不能删除" });
    return;
  }
  const result = db.prepare("DELETE FROM suppliers WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "供应商不存在" });
    return;
  }
  void notifyBusinessAction({
    action: "删除供应商",
    operator: req.session.user?.username,
    fields: [{ label: "供应商名称", value: row?.name }]
  });
  res.json({ ok: true });
});
