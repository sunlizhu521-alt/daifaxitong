import { execSync } from "node:child_process";
import path from "node:path";
import { config, validateConfig } from "./config.js";
import { createApp } from "./http.js";
import { getDb } from "./db/index.js";
import { startDailyBackupScheduler } from "./backup.js";

getDb();
validateConfig();
startDailyBackupScheduler();

setInterval(() => {
  try {
    execSync("npx tsx src/db/backup.ts", { cwd: path.resolve(config.rootDir, "server"), stdio: "ignore" });
  } catch {
    // 备份失败不影响主流程
  }
}, 1000 * 60 * 60 * 6);

createApp().listen(config.port, () => {
  console.log(`一件代发系统已启动：http://localhost:${config.port}`);
});
