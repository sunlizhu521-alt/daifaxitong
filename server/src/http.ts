import express from "express";
import session from "express-session";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { apiRouter } from "./routes/index.js";
import { getRequestIp, sessionMaxAgeMs, SqliteSessionStore } from "./sessionStore.js";

export function createApp() {
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const app = express();
  app.set("trust proxy", true);
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json({ limit: "2mb" }));
  app.use("/uploads", express.static(config.uploadDir));
  app.use(
    session({
      name: "daifa.sid",
      store: new SqliteSessionStore(),
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: false,
        maxAge: sessionMaxAgeMs
      }
    })
  );
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) {
      next();
      return;
    }
    if (!req.session.user || !req.session.loginIp) {
      next();
      return;
    }
    if (req.session.loginIp === getRequestIp(req)) {
      next();
      return;
    }
    req.session.destroy(() => {
      res.clearCookie("daifa.sid");
      res.status(401).json({ message: "登录 IP 已变化，请重新登录" });
    });
  });

  app.use("/api", apiRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "接口不存在" });
  });

  if (fs.existsSync(config.clientDist)) {
    app.use(express.static(config.clientDist));
    app.get(/.*/, (_req, res) => {
      res.sendFile(path.join(config.clientDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "服务器内部错误" });
  });

  return app;
}
