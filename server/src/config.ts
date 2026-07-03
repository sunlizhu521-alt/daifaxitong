import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd().endsWith("server") ? path.resolve(process.cwd(), "..") : process.cwd();

export const config = {
  rootDir,
  port: Number(process.env.PORT ?? 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH ?? "server/data/daifa.sqlite"),
  uploadDir: path.resolve(rootDir, "server/uploads"),
  adminUsername: process.env.ADMIN_USERNAME ?? "孙立柱",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  dingtalkWebhook: process.env.DINGTALK_WEBHOOK ?? process.env.WEBHOOK ?? "",
  dingtalkSecret: process.env.DINGTALK_SECRET ?? process.env.SECRET ?? "",
  feishuWebhook: process.env.FEISHU_WEBHOOK ?? "",
  feishuSecret: process.env.FEISHU_SECRET ?? "",
  clientDist: path.resolve(rootDir, "server/dist/public")
};

export function validateConfig() {
  const errors: string[] = [];
  if (!config.adminPassword) errors.push("ADMIN_PASSWORD 未设置");
  if (!config.sessionSecret) errors.push("SESSION_SECRET 未设置");
  if (errors.length) {
    console.error("缺少必要的环境变量:\n" + errors.map((error) => "  - " + error).join("\n"));
    process.exit(1);
  }
}
