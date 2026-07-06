import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getDb } from "./index.js";

const backupDir = path.resolve(config.rootDir, "server", "backups");
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const today = timestamp.slice(0, 10);
const backupFile = path.join(backupDir, `daifa-backup-${timestamp}.sqlite`);

const db = getDb();
await db.backup(backupFile);
console.log(`数据库已备份：${backupFile}`);

// 清理7天前的备份
const files = fs.readdirSync(backupDir).filter((file) => file.startsWith("daifa-backup-") && file.endsWith(".sqlite"));
for (const file of files) {
  const dateMatch = file.match(/^daifa-backup-(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) {
    const fileDate = new Date(dateMatch[1]);
    const daysAgo = (Date.now() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysAgo > 7) {
      fs.unlinkSync(path.join(backupDir, file));
      console.log(`清理过期备份：${file}`);
    }
  }
}

void today;
