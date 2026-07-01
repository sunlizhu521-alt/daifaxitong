import { Router } from "express";
import { getDb } from "../db/index.js";

export const dashboardRouter = Router();

dashboardRouter.get("/summary", (_req, res) => {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const counts = db
    .prepare(
      `SELECT
        COUNT(*) AS totalOrders,
        SUM(CASE WHEN date(createdAt) = date(?) THEN 1 ELSE 0 END) AS todayOrders,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pendingOrders,
        SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS shippedOrders,
        SUM(CASE WHEN status = 'exception' THEN 1 ELSE 0 END) AS exceptionOrders
      FROM orders`
    )
    .get(today);
  const trend = db
    .prepare(
      `WITH RECURSIVE dates(day, n) AS (
        SELECT date('now', '-6 days'), 0
        UNION ALL
        SELECT date(day, '+1 day'), n + 1 FROM dates WHERE n < 6
      )
      SELECT dates.day, COUNT(orders.id) AS orders
      FROM dates
      LEFT JOIN orders ON date(orders.createdAt) = dates.day
      GROUP BY dates.day
      ORDER BY dates.day`
    )
    .all();
  const recentOrders = db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 8").all();
  res.json({ counts, trend, recentOrders });
});
