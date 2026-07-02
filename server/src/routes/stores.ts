import fs from "node:fs";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { config } from "../config.js";
import { getDb, nowIso } from "../db/index.js";
import { ROLE_ADMIN } from "../permissions.js";
import { cell, normalizeHeader } from "../utils.js";

export const storesRouter = Router();
const upload = multer({ dest: config.uploadDir });

const storeSchema = z.object({
  name: z.string().trim().min(1, "店铺名称不能为空"),
  shortName: z.string().optional().default(""),
  platform: z.string().trim().min(1, "平台不能为空"),
  operator: z.string().optional().default(""),
  note: z.string().optional().default("")
});

storesRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const db = getDb();
  const rows = keyword
    ? db
        .prepare("SELECT * FROM stores WHERE name LIKE ? OR shortName LIKE ? OR platform LIKE ? OR operator LIKE ? OR note LIKE ? ORDER BY id DESC")
        .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    : db.prepare("SELECT * FROM stores ORDER BY id DESC").all();
  res.json(rows);
});

storesRouter.post("/", (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare("INSERT INTO stores (name, shortName, platform, owner, operator, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(parsed.data.name, parsed.data.shortName, parsed.data.platform, parsed.data.operator, parsed.data.operator, parsed.data.note, nowIso());
    res.status(201).json(db.prepare("SELECT * FROM stores WHERE id = ?").get(result.lastInsertRowid));
  } catch {
    res.status(409).json({ message: "店铺和平台已存在" });
  }
});

storesRouter.post("/import", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ message: "请上传 Excel 文件" });
    return;
  }
  const XLSX = (await import("xlsx")).default;
  const db = getDb();
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const errors: Array<{ row: number; message: string }> = [];
    const seen = new Set<string>();
    const parsedRows = rows.map((row, index) => {
      const payload = {
        name: cell(row, ["店铺名称", "店铺", "名称", "name"]),
        shortName: cell(row, ["店铺简称", "简称", "shortName"]),
        platform: cell(row, ["平台", "platform"]),
        operator: cell(row, ["运营", "operator"]),
        note: cell(row, ["备注", "note"])
      };
      const parsed = storeSchema.safeParse(payload);
      if (!parsed.success) {
        errors.push({ row: index + 2, message: parsed.error.issues[0]?.message ?? "参数错误" });
        return null;
      }
      const uniqueKey = `${parsed.data.name}__${parsed.data.platform}`;
      if (seen.has(uniqueKey)) {
        errors.push({ row: index + 2, message: `店铺重复：${parsed.data.name}/${parsed.data.platform}` });
        return null;
      }
      seen.add(uniqueKey);
      const exists = db.prepare("SELECT id FROM stores WHERE name = ? AND platform = ?").get(parsed.data.name, parsed.data.platform);
      if (exists) {
        errors.push({ row: index + 2, message: `店铺已存在：${parsed.data.name}/${parsed.data.platform}` });
        return null;
      }
      return parsed.data;
    });

    if (!rows.length) errors.push({ row: 1, message: "导入文件没有数据" });
    if (errors.length) {
      res.status(400).json({ message: "导入文件存在错误，未写入数据", errors });
      return;
    }

    const insert = db.prepare("INSERT INTO stores (name, shortName, platform, owner, operator, note, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)");
    const tx = db.transaction(() => {
      for (const row of parsedRows) {
        if (row) insert.run(row.name, row.shortName, row.platform, row.operator, row.operator, row.note, nowIso());
      }
      db.prepare(
        "INSERT INTO import_jobs (type, filename, totalRows, successRows, failedRows, errorJson) VALUES (?, ?, ?, ?, ?, ?)"
      ).run("stores", req.file!.originalname, rows.length, rows.length, 0, "[]");
    });
    tx();
    res.json({ totalRows: rows.length, successRows: rows.length, failedRows: 0 });
  } catch {
    if (!res.headersSent) {
      res.status(400).json({ message: "Excel 解析失败，请确认文件是 .xlsx/.xls 格式且第一行是表头" });
    }
  } finally {
    fs.unlink(req.file.path, () => undefined);
  }
});

storesRouter.put("/:id", (req, res) => {
  const parsed = storeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  const db = getDb();
  try {
    const result = db
      .prepare("UPDATE stores SET name = ?, shortName = ?, platform = ?, owner = ?, operator = ?, note = ?, updatedAt = ? WHERE id = ?")
      .run(parsed.data.name, parsed.data.shortName, parsed.data.platform, parsed.data.operator, parsed.data.operator, parsed.data.note, nowIso(), id);
    if (result.changes === 0) {
      res.status(404).json({ message: "店铺不存在" });
      return;
    }
    res.json(db.prepare("SELECT * FROM stores WHERE id = ?").get(id));
  } catch {
    res.status(409).json({ message: "店铺和平台已存在" });
  }
});

storesRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const result = getDb().prepare("DELETE FROM stores WHERE id = ?").run(Number(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "店铺不存在" });
    return;
  }
  res.json({ ok: true });
});
