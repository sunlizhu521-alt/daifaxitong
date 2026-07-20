import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd().endsWith("server") ? path.resolve(process.cwd(), "..") : process.cwd();
const nodeEnv = process.env.NODE_ENV ?? "development";
const isProduction = nodeEnv === "production";
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE.toLowerCase() !== "false"
  : isProduction;
const sessionMaxAgeHours = Number(process.env.SESSION_MAX_AGE_HOURS ?? 720);
const corsOrigins = (process.env.CORS_ORIGINS ?? (isProduction ? "" : "http://localhost:5173"))
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

export const config = {
  rootDir,
  nodeEnv,
  isProduction,
  port: Number(process.env.PORT ?? 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH ?? "server/data/daifa.sqlite"),
  uploadDir: path.resolve(rootDir, "server/uploads"),
  backupDir: path.resolve(rootDir, "server/backups"),
  safetyBackupDir: path.resolve(rootDir, process.env.SAFETY_BACKUP_DIR ?? "../daifaxitong-safe-backups"),
  adminUsername: process.env.ADMIN_USERNAME?.trim() ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  trustProxy: process.env.TRUST_PROXY?.trim() || "loopback",
  cookieSecure,
  sessionMaxAgeMs: sessionMaxAgeHours * 60 * 60 * 1000,
  corsOrigins,
  dingtalkWebhook: process.env.DINGTALK_WEBHOOK ?? "",
  dingtalkSecret: process.env.DINGTALK_SECRET ?? "",
  feishuWebhook: process.env.FEISHU_WEBHOOK ?? "",
  feishuSecret: process.env.FEISHU_SECRET ?? "",
  returnDingtalkWebhook: process.env.RETURN_DINGTALK_WEBHOOK ?? "",
  returnDingtalkSecret: process.env.RETURN_DINGTALK_SECRET ?? "",
  repairDingtalkWebhook: process.env.REPAIR_DINGTALK_WEBHOOK ?? "",
  repairDingtalkSecret: process.env.REPAIR_DINGTALK_SECRET ?? "",
  kuaidi100Customer: process.env.KUAIDI100_CUSTOMER ?? "",
  kuaidi100Key: process.env.KUAIDI100_KEY ?? "",
  clientDist: path.resolve(rootDir, "server/dist/public")
};

export function validateConfig() {
  const errors: string[] = [];
  if (!config.adminUsername) errors.push("ADMIN_USERNAME 未设置");
  if (config.adminPassword.length < 12) errors.push("ADMIN_PASSWORD 必须至少 12 个字符");
  if (config.sessionSecret.length < 32) errors.push("SESSION_SECRET 必须至少 32 个字符");
  if (!Number.isFinite(config.sessionMaxAgeMs) || config.sessionMaxAgeMs <= 0) {
    errors.push("SESSION_MAX_AGE_HOURS 必须是正数");
  }
  if (errors.length) {
    console.error("缺少或无效的安全环境变量:\n" + errors.map((error) => "  - " + error).join("\n"));
    process.exit(1);
  }
}
