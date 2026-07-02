import { Router } from "express";
import { z } from "zod";
import { getDb, nowIso } from "../db/index.js";
import { notifyBusinessAction } from "../notifications/dingtalk.js";
import { ROLE_ADMIN } from "../permissions.js";

export const carriersRouter = Router();

const carrierSchema = z.object({
  name: z.string().trim().min(1, "快递名称不能为空"),
  contact: z.string().optional().default(""),
  address: z.string().optional().default(""),
  note: z.string().optional().default("")
});

carriersRouter.get("/", (req, res) => {
  const keyword = String(req.query.keyword ?? "").trim();
  const db = getDb();
  const rows = keyword
    ? db
        .prepare("SELECT * FROM carriers WHERE name LIKE ? OR contact LIKE ? OR address LIKE ? OR note LIKE ? ORDER BY id DESC")
        .all(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
    : db.prepare("SELECT * FROM carriers ORDER BY id DESC").all();
  res.json(rows);
});

carriersRouter.post("/", (req, res) => {
  const parsed = carrierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const db = getDb();
  try {
    const result = db
      .prepare("INSERT INTO carriers (name, contact, address, note, updatedAt) VALUES (?, ?, ?, ?, ?)")
      .run(parsed.data.name, parsed.data.contact, parsed.data.address, parsed.data.note, nowIso());
    const row = db.prepare("SELECT * FROM carriers WHERE id = ?").get(result.lastInsertRowid) as Record<string, unknown>;
    void notifyBusinessAction({
      action: "新增快递公司",
      operator: req.session.user?.username,
      fields: [
        { label: "快递名称", value: row.name },
        { label: "联系人", value: row.contact },
        { label: "地址", value: row.address },
        { label: "备注", value: row.note }
      ]
    });
    res.status(201).json(row);
  } catch {
    res.status(409).json({ message: "快递名称已存在" });
  }
});

carriersRouter.put("/:id", (req, res) => {
  const parsed = carrierSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "参数错误" });
    return;
  }
  const id = Number(req.params.id);
  try {
    const result = getDb()
      .prepare("UPDATE carriers SET name = ?, contact = ?, address = ?, note = ?, updatedAt = ? WHERE id = ?")
      .run(parsed.data.name, parsed.data.contact, parsed.data.address, parsed.data.note, nowIso(), id);
    if (result.changes === 0) {
      res.status(404).json({ message: "快递公司不存在" });
      return;
    }
  } catch {
    res.status(409).json({ message: "快递名称已存在" });
    return;
  }
  const row = getDb().prepare("SELECT * FROM carriers WHERE id = ?").get(id) as Record<string, unknown>;
  void notifyBusinessAction({
    action: "修改快递公司",
    operator: req.session.user?.username,
    fields: [
      { label: "快递名称", value: row.name },
      { label: "联系人", value: row.contact },
      { label: "地址", value: row.address },
      { label: "备注", value: row.note }
    ]
  });
  res.json(row);
});

carriersRouter.delete("/:id", (req, res) => {
  if (req.session.user?.role !== ROLE_ADMIN) {
    res.status(403).json({ message: "只有管理员可以删除记录" });
    return;
  }
  const id = Number(req.params.id);
  const row = getDb().prepare("SELECT * FROM carriers WHERE id = ?").get(id) as Record<string, unknown> | undefined;
  const used = getDb().prepare("SELECT COUNT(*) AS count FROM shipments WHERE carrierId = ?").get(id) as { count: number };
  if (used.count > 0) {
    res.status(409).json({ message: "快递公司已被发货记录引用，不能删除" });
    return;
  }
  const result = getDb().prepare("DELETE FROM carriers WHERE id = ?").run(id);
  if (result.changes === 0) {
    res.status(404).json({ message: "快递公司不存在" });
    return;
  }
  void notifyBusinessAction({
    action: "删除快递公司",
    operator: req.session.user?.username,
    fields: [{ label: "快递名称", value: row?.name }]
  });
  res.json({ ok: true });
});
