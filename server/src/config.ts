import path from "node:path";
import dotenv from "dotenv";

dotenv.config();

const rootDir = process.cwd().endsWith("server") ? path.resolve(process.cwd(), "..") : process.cwd();

export const config = {
  rootDir,
  port: Number(process.env.PORT ?? 3000),
  databasePath: path.resolve(rootDir, process.env.DATABASE_PATH ?? "server/data/daifa.sqlite"),
  uploadDir: path.resolve(rootDir, "server/uploads"),
  backupDir: path.resolve(rootDir, "server/backups"),
  adminUsername: process.env.ADMIN_USERNAME ?? "孙立柱",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  dingtalkWebhook: process.env.DINGTALK_WEBHOOK ?? process.env.WEBHOOK ?? "https://oapi.dingtalk.com/robot/send?access_token=0b44138315b25602a5baa0c77b7aa4e2009ef3319344034c2e2f6505e874f042",
  dingtalkSecret: process.env.DINGTALK_SECRET ?? process.env.SECRET ?? "SEC5ea8742d437ce30f9712ffff7d9f9849b723c18c6de8f65389778194f8cf14b9",
  feishuWebhook: process.env.FEISHU_WEBHOOK ?? "https://open.feishu.cn/open-apis/bot/v2/hook/9d1ddc5e-9931-48e0-afa9-32ad19f9fd38",
  feishuSecret: process.env.FEISHU_SECRET ?? "5ErgxrKDawDN8n53uDokme",
  returnDingtalkWebhook: process.env.RETURN_DINGTALK_WEBHOOK ?? "https://oapi.dingtalk.com/robot/send?access_token=899d226cd4c4579715823d26a7c88a07dc024b7547a81d2ce61e39989829a6b1",
  returnDingtalkSecret: process.env.RETURN_DINGTALK_SECRET ?? "SEC1e6e76a73af889c0549fb14829f5f1968cafc5bebbdb1943c67952de256e66f9",
  kuaidi100Customer: process.env.KUAIDI100_CUSTOMER ?? "",
  kuaidi100Key: process.env.KUAIDI100_KEY ?? "",
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
