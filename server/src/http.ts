import express from "express";
import session from "express-session";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import fs from "node:fs";
import path from "node:path";
import { apiRateLimit } from "./auth/apiRateLimit.js";
import { csrfProtect } from "./auth/csrf.js";
import { config } from "./config.js";
import { apiRouter } from "./routes/index.js";
import { requireAuth } from "./routes/auth.js";
import { sessionMaxAgeMs, SqliteSessionStore } from "./sessionStore.js";

export function createApp() {
  fs.mkdirSync(config.uploadDir, { recursive: true });

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.set("trust proxy", config.trustProxy);
  app.use((_req, res, next) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"
    );
    if (config.isProduction && config.cookieSecure) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  if (config.corsOrigins.length > 0) {
    app.use(cors({ origin: config.corsOrigins, credentials: true }));
  }
  app.use(compression({ threshold: 1024 }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use("/api", apiRateLimit);
  app.use(cookieParser());
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
        sameSite: "strict",
        secure: config.cookieSecure,
        maxAge: sessionMaxAgeMs
      }
    })
  );
  app.use(csrfProtect);
  app.use(express.json({ limit: "2mb" }));
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      next();
      return;
    }
    const origin = req.get("origin");
    const fetchSite = req.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      res.status(403).json({ message: "跨站请求已被拒绝" });
      return;
    }
    if (!origin) {
      next();
      return;
    }
    const requestOrigin = `${req.protocol}://${req.get("host")}`;
    if (origin !== requestOrigin && !config.corsOrigins.includes(origin)) {
      res.status(403).json({ message: "请求来源未获授权" });
      return;
    }
    next();
  });
  app.use("/uploads", requireAuth, express.static(config.uploadDir, { dotfiles: "deny", fallthrough: false }));
  app.use("/api", apiRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ message: "接口不存在" });
  });

  if (fs.existsSync(config.clientDist)) {
    app.use(
      "/assets",
      express.static(path.join(config.clientDist, "assets"), {
        immutable: true,
        maxAge: "1y",
        fallthrough: false
      })
    );
    app.use(express.static(config.clientDist, { index: false, maxAge: "1h" }));
    app.get(/.*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(config.clientDist, "index.html"));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    res.status(500).json({ message: "服务器内部错误" });
  });

  return app;
}
