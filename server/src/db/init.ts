import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { closeDb, getDb } from "./index.js";

fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });
getDb();
closeDb();

console.log(`数据库已初始化：${config.databasePath}`);
