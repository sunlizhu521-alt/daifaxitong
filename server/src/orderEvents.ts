import { getDb } from "./db/index.js";

export function logOrderEvent(orderId: number, action: string, detail: string, operator?: string) {
  getDb()
    .prepare("INSERT INTO order_events (orderId, action, detail, operator) VALUES (?, ?, ?, ?)")
    .run(orderId, action, detail, operator ?? "");
}

export function logOrderEventByOrderNo(orderNo: string, action: string, detail: string, operator?: string) {
  const row = getDb().prepare("SELECT id FROM orders WHERE orderNo = ?").get(orderNo) as { id: number } | undefined;
  if (!row) return;
  logOrderEvent(row.id, action, detail, operator);
}
