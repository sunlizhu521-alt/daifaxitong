import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import XLSX from "xlsx";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "daifa-test-"));
process.env.DATABASE_PATH = path.join(tempDir, "test.sqlite");
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "secret";
process.env.SESSION_SECRET = "test-secret";

const { createApp } = await import("./http.js");
const { closeDb } = await import("./db/index.js");

function writeWorkbook(filename: string, rows: Record<string, unknown>[]) {
  const filePath = path.join(tempDir, filename);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Sheet1");
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

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
  const returnRecord = await agent
    .post("/api/returns")
    .field("storeName", "测试店铺")
    .field("operator", "运营A")
    .field("orderNo", "DF001")
    .field("model", "默认规格")
    .field("customerName", "张三")
    .field("customerPhone", "13800000000")
    .field("address", "上海市")
    .field("status", "待处理")
    .field("action", "拦截")
    .field("reason", "七天无理由")
    .field("note", "测试退货")
    .expect(201);
  assert.equal(returnRecord.body.trackingNo, "SF123");
  await agent
    .post("/api/returns")
    .field("storeName", "测试店铺")
    .field("orderNo", "DF001")
    .field("model", "默认规格")
    .field("customerName", "张三")
    .field("address", "上海市")
    .field("status", "待处理")
    .field("action", "寄回")
    .field("reason", "质量问题")
    .expect(400);
  await agent.delete(`/api/products/${product.body.id}`).expect(409);
});

test("registered users must be authorized before accessing pages", async () => {
  const app = createApp();
  const admin = request.agent(app);
  const member = request.agent(app);

  await member.post("/api/auth/register").send({ username: "member", password: "secret123" }).expect(201);
  await member.post("/api/auth/login").send({ username: "member", password: "secret123" }).expect(403);

  await admin.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);
  const users = await admin.get("/api/auth/users").expect(200);
  const target = users.body.users.find((user: { username: string }) => user.username === "member");
  assert.ok(target);

  await admin.patch(`/api/auth/users/${target.id}/access`).send({ pageAccess: ["dropShippingRegistration"] }).expect(200);
  const login = await member.post("/api/auth/login").send({ username: "member", password: "secret123" }).expect(200);
  assert.deepEqual(login.body.pageAccess, ["dropShippingRegistration"]);

  await member.get("/api/orders").expect(200);
  await member.get("/api/products").expect(200);
  await member.get("/api/dashboard/summary").expect(403);

  const supplier = await admin.post("/api/suppliers").send({ name: "权限测试供应商" }).expect(201);
  const product = await admin
    .post("/api/products")
    .send({ name: "权限测试商品", sku: "默认规格", supplierId: supplier.body.id, costPrice: 8, salePrice: 16 })
    .expect(201);
  const order = await admin
    .post("/api/orders")
    .send({
      orderNo: "AUTH-DELETE-001",
      customerName: "权限用户",
      address: "上海市测试路",
      items: [
        {
          productId: product.body.id,
          productName: product.body.name,
          productSku: product.body.sku,
          quantity: 1,
          unitCost: 8,
          unitSalePrice: 16
        }
      ]
    })
    .expect(201);

  await member.delete(`/api/orders/${order.body.id}`).expect(403);
  await member.delete(`/api/products/${product.body.id}`).expect(403);
  await admin.delete(`/api/orders/${order.body.id}`).expect(200);
});

test("imports suppliers, products and stores from Excel", async () => {
  const app = createApp();
  const agent = request.agent(app);

  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  const suppliersFile = writeWorkbook("suppliers.xlsx", [
    { 供应商名称: "导入供应商A", 联系人: "王五", 电话: "13900000000", 地址: "杭州", 结算方式: "月结", 备注: "测试" }
  ]);
  await agent.post("/api/suppliers/import").attach("file", suppliersFile).expect(200);
  const suppliers = await agent.get("/api/suppliers").expect(200);
  assert.ok(suppliers.body.some((supplier: { name: string }) => supplier.name === "导入供应商A"));

  const productsFile = writeWorkbook("products.xlsx", [
    { 商品名称: "导入商品A", SKU: "红色", 成本价: 12, 建议售价: 29, 供应商: "导入供应商A", 状态: "上架", 备注: "测试" }
  ]);
  await agent.post("/api/products/import").attach("file", productsFile).expect(200);
  const products = await agent.get("/api/products").expect(200);
  assert.ok(products.body.some((product: { name: string; sku: string }) => product.name === "导入商品A" && product.sku === "红色"));

  const storesFile = writeWorkbook("stores.xlsx", [{ 店铺名称: "导入店铺A", 平台: "淘宝", 负责人: "赵六", 备注: "测试" }]);
  await agent.post("/api/stores/import").attach("file", storesFile).expect(200);
  const stores = await agent.get("/api/stores").expect(200);
  assert.ok(stores.body.some((store: { name: string; platform: string }) => store.name === "导入店铺A" && store.platform === "淘宝"));
});

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
