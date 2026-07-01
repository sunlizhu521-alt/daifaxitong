import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daifa-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "secret";
process.env.SESSION_SECRET = "test-secret";

const { createApp } = await import("./http.js");
const { closeDb } = await import("./db/index.js");

test("auth, supplier, product, order and shipment flow", async () => {
  const app = createApp();
  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({ username: "admin", password: "bad" }).expect(401);
  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  const supplier = await agent.post("/api/suppliers").send({ name: "上海供应商", contact: "李四" }).expect(201);
  const product = await agent
    .post("/api/products")
    .send({ name: "示例商品", sku: "默认规格", supplierId: supplier.body.id, costPrice: 10, salePrice: 18 })
    .expect(201);

  const order = await agent
    .post("/api/orders")
    .send({
      orderNo: "DF001",
      customerName: "张三",
      customerPhone: "13800000000",
      address: "上海市",
      items: [
        {
          productId: product.body.id,
          productName: product.body.name,
          productSku: product.body.sku,
          quantity: 2,
          unitCost: 10,
          unitSalePrice: 18
        }
      ]
    })
    .expect(201);
  await agent.post("/api/orders").send(order.body).expect(409);

  await agent
    .post(`/api/orders/${order.body.id}/ship`)
    .send({ supplierId: supplier.body.id, carrier: "顺丰", trackingNo: "SF123", shippedAt: "2026-07-01T09:00" })
    .expect(200);

  const detail = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(detail.body.status, "shipped");
  assert.equal(detail.body.shipments[0].trackingNo, "SF123");
  await agent.delete(`/api/products/${product.body.id}`).expect(409);
});

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
