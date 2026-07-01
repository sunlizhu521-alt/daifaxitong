import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { closeDb, getDb } from "./index.js";
import { ensureAdminUser } from "../auth/users.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
ensureAdminUser(getDb());
closeDb();

console.log(`数据库已初始化：${config.databasePath}`);
