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
  adminPassword: process.env.ADMIN_PASSWORD ?? "521sunlizhu",
  sessionSecret: process.env.SESSION_SECRET ?? "change-me",
  clientDist: path.resolve(rootDir, "server/dist/public")
};
