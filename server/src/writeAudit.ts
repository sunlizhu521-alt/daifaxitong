import type { RequestHandler } from "express";
import { getDb } from "./db/index.js";

const writeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const auditDataWrite: RequestHandler = (req, res, next) => {
  if (!writeMethods.has(req.method)) {
    next();
    return;
  }

  res.once("finish", () => {
    try {
      getDb()
        .prepare(
          `INSERT INTO data_write_audit (actor, method, path, targetId, result, statusCode)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          req.session.user?.username ?? "",
          req.method,
          req.originalUrl.split("?")[0],
          String(req.params.id ?? ""),
          res.statusCode < 400 ? "success" : "failed",
          res.statusCode
        );
    } catch (error) {
      console.error("Failed to write data audit record", error);
    }
  });
  next();
};
