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
process.env.WEBHOOK = "";
process.env.SECRET = "";
process.env.DINGTALK_WEBHOOK = "";
process.env.DINGTALK_SECRET = "";
process.env.RETURN_DINGTALK_WEBHOOK = "";
process.env.RETURN_DINGTALK_SECRET = "";
process.env.FEISHU_WEBHOOK = "";
process.env.FEISHU_SECRET = "";
process.env.ALLOW_DATABASE_CREATE = "true";

const { createApp } = await import("./http.js");
const { closeDb, getDb } = await import("./db/index.js");
const { createUser } = await import("./auth/users.js");

function writeWorkbook(filename: string, rows: Record<string, unknown>[]) {
  const filePath = path.join(tempDir, filename);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Sheet1");
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

function csrfFromCookies(cookies: string[] | string) {
  const cookieList = Array.isArray(cookies) ? cookies : [cookies];
  const cookie = cookieList.find((item) => item.startsWith("csrf_token="));
  assert.ok(cookie);
  const token = cookie.split(";")[0].slice("csrf_token=".length);
  return { cookie: cookie.split(";")[0], token };
}

async function enableCsrf(agent: ReturnType<typeof request.agent>) {
  const response = await agent.get("/api/health").expect(200);
  const { token } = csrfFromCookies(response.headers["set-cookie"] ?? []);
  const mutableAgent = agent as unknown as Record<string, (url: string) => request.Test>;
  for (const method of ["post", "put", "patch", "delete"]) {
    const original = mutableAgent[method].bind(agent);
    mutableAgent[method] = (url: string) => original(url).set("x-csrf-token", token);
  }
  return token;
}

async function csrfHeaders(app: ReturnType<typeof createApp>) {
  const response = await request(app).get("/api/health").expect(200);
  return csrfFromCookies(response.headers["set-cookie"] ?? []);
}

test("auth, supplier, product, order and shipment flow", async () => {
  const app = createApp();
  const agent = request.agent(app);
  await enableCsrf(agent);

  const health = await request(app).get("/api/health").expect(200);
  assert.equal(health.headers["cache-control"], "no-store");
  assert.equal(health.headers["x-powered-by"], undefined);

  await agent.post("/api/auth/login").send({ username: "admin", password: "bad" }).expect(401);
  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  const supplier = await agent.post("/api/suppliers").send({ name: "上海供应商", shortName: "上海供", contact: "李四", storeAddress: "上海" }).expect(201);
  const carrier = await agent.post("/api/carriers").send({ name: "顺丰速运", contact: "客服", address: "深圳", note: "常用快递" }).expect(201);
  assert.equal(carrier.body.note, "常用快递");
  const product = await agent
    .post("/api/products")
    .send({ materialCode: "MAT001", productLine: "家居", series: "基础", ssku: "默认规格", name: "示例商品", supplierModel: "GYS-001", supplierId: supplier.body.id })
    .expect(201);

  const order = await agent
    .post("/api/orders")
    .send({
      orderNo: "DF001",
      supplierId: supplier.body.id,
      storeName: "测试店铺",
      registrarName: "admin",
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
  const duplicatePayload = {
    orderNo: "DF-DUP",
    supplierId: supplier.body.id,
    storeName: "测试店铺",
    registrarName: "admin",
    customerName: "重复客户",
    customerPhone: "13800000001",
    address: "上海市重复地址",
    items: [
      {
        productId: product.body.id,
        productName: product.body.name,
        productSku: product.body.sku,
        quantity: 1,
        unitCost: 10,
        unitSalePrice: 18
      }
    ]
  };
  await agent.post("/api/orders").send(duplicatePayload).expect(201);
  const duplicateOrder = await agent.post("/api/orders").send(duplicatePayload).expect(201);
  assert.match(duplicateOrder.body.duplicateWarning, /已存在/);

  await agent.patch(`/api/orders/${order.body.id}/purchase-order`).send({ purchaseOrderNo: "CG20260701001", purchaseOrderUser: "采购A" }).expect(200);
  const purchaseRows = await agent.get("/api/orders?keyword=CG20260701001").expect(200);
  assert.equal(purchaseRows.body.total, 1);
  assert.equal(purchaseRows.body.page, 1);
  assert.equal(purchaseRows.body.pageSize, 50);
  assert.equal(purchaseRows.body.rows[0].purchaseOrderNo, "CG20260701001");
  assert.equal(purchaseRows.body.rows[0].purchaseOrderUser, "采购A");
  assert.equal(purchaseRows.body.rows[0].status, "purchased");
  const twentyPerPage = await agent.get("/api/orders?page=1&pageSize=20").expect(200);
  assert.equal(twentyPerPage.body.page, 1);
  assert.equal(twentyPerPage.body.pageSize, 20);
  await agent.patch(`/api/orders/${order.body.id}/purchase-order`).send({ purchaseOrderNo: "CG20260701002", purchaseOrderUser: "采购B" }).expect(200);
  const modifiedPurchaseRows = await agent.get("/api/orders?keyword=CG20260701002").expect(200);
  assert.equal(modifiedPurchaseRows.body.rows[0].purchaseOrderNo, "CG20260701002");
  assert.equal(modifiedPurchaseRows.body.rows[0].purchaseOrderUser, "采购B");
  assert.equal(modifiedPurchaseRows.body.rows[0].status, "purchased");
  const purchaseUserRows = await agent.get("/api/orders?keyword=采购B").expect(200);
  assert.equal(purchaseUserRows.body.rows[0].orderNo, "DF001");
  await agent.patch(`/api/orders/${order.body.id}/status`).send({ status: "shipped" }).expect(200);
  const shippedDetail = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(shippedDetail.body.status, "shipped");
  await agent.patch(`/api/orders/${order.body.id}/purchase-order`).send({ purchaseOrderNo: "CG20260701003", purchaseOrderUser: "采购C" }).expect(200);
  const purchaseAfterShipped = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(purchaseAfterShipped.body.purchaseOrderNo, "CG20260701003");
  assert.equal(purchaseAfterShipped.body.purchaseOrderUser, "采购C");
  assert.equal(purchaseAfterShipped.body.status, "purchased");
  await agent.patch(`/api/orders/${order.body.id}/status`).send({ status: "pending" }).expect(200);
  const filteredRows = await agent.get("/api/orders?series=基础&sku=默认规格").expect(200);
  assert.ok(filteredRows.body.rows.some((row: { orderNo: string }) => row.orderNo === "DF001"));

  await agent
    .post(`/api/orders/${order.body.id}/ship`)
    .send({ supplierId: supplier.body.id, carrierId: carrier.body.id, carrier: "顺丰", trackingNo: "SF123", shippedAt: "2026-07-01T09:00" })
    .expect(200);

  const detail = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(detail.body.status, "filled");
  assert.equal(detail.body.supplierId, supplier.body.id);
  assert.equal(detail.body.storeName, "测试店铺");
  assert.equal(detail.body.registrarName, "admin");
  assert.equal(detail.body.shipments[0].carrier, "顺丰速运");
  assert.equal(detail.body.shipments[0].carrierId, carrier.body.id);
  assert.equal(detail.body.shipments[0].trackingNo, "SF123");
  await agent.patch(`/api/orders/${order.body.id}/supplier-note`).send({ supplierNote: "供应商测试备注" }).expect(200);
  const dedicatedFilters = await agent
    .get(
      `/api/orders?customerName=${encodeURIComponent("张三")}&trackingNo=${encodeURIComponent("SF123")}&supplierNote=${encodeURIComponent("测试备注")}`
    )
    .expect(200);
  assert.equal(dedicatedFilters.body.total, 1);
  assert.equal(dedicatedFilters.body.rows[0].orderNo, "DF001");
  await agent
    .get(
      `/api/orders/summary-export?orderType=dropship&customerName=${encodeURIComponent("张三")}&trackingNo=${encodeURIComponent("SF123")}&supplierNote=${encodeURIComponent("测试备注")}`
    )
    .expect(200);
  const operationRecords = await agent.get("/api/operation-records?keyword=DF001").expect(200);
  assert.ok(operationRecords.body.total >= 2);
  assert.ok(operationRecords.body.rows.some((row: { action: string }) => row.action === "登记代发"));
  assert.ok(operationRecords.body.rows.some((row: { action: string }) => row.action === "填写发货单号"));
  const writeAudit = getDb()
    .prepare("SELECT result, statusCode FROM data_write_audit ORDER BY id")
    .all() as Array<{ result: string; statusCode: number }>;
  assert.ok(writeAudit.some((row) => row.result === "success" && row.statusCode < 400));
  assert.ok(writeAudit.some((row) => row.result === "failed" && row.statusCode >= 400));
  await agent.delete(`/api/operation-records/${operationRecords.body.rows[0].id}`).expect(200);
  const operationRecordsAfterDelete = await agent.get("/api/operation-records?keyword=DF001").expect(200);
  assert.equal(operationRecordsAfterDelete.body.total, operationRecords.body.total - 1);
  const shippingExport = await agent.get("/api/orders/shipping-export?status=filled").expect(200);
  assert.match(shippingExport.headers["content-type"], /spreadsheetml\.sheet/);
  const returnOrdersBeforeReturn = await agent.get("/api/returns/orders?keyword=DF001").expect(200);
  assert.equal(returnOrdersBeforeReturn.body[0].orderNo, "DF001");
  assert.equal(returnOrdersBeforeReturn.body[0].returnId, null);
  assert.equal(returnOrdersBeforeReturn.body[0].shipmentTrackingNo, "SF123");
  assert.equal(returnOrdersBeforeReturn.body[0].logisticsStatus, "已揽件");
  const returnRecord = await agent
    .post("/api/returns")
    .field("storeName", "测试店铺")
    .field("operator", "运营A")
    .field("orderNo", "DF001")
    .field("model", "默认规格")
    .field("customerName", "张三")
    .field("customerPhone", "13800000000")
    .field("address", "上海市")
    .field("status", "已提交退货")
    .field("action", "拦截")
    .field("reason", "七天无理由")
    .field("note", "测试退货")
    .expect(201);
  assert.equal(returnRecord.body.returnCarrier, "顺丰速运");
  assert.equal(returnRecord.body.trackingNo, "SF123");
  const shippingScheduleAfterRegistration = await agent
    .get("/api/orders?orderType=dropship&status=filled&shippingSchedule=yes")
    .expect(200);
  assert.equal(shippingScheduleAfterRegistration.body.total, 1);
  assert.equal(shippingScheduleAfterRegistration.body.rows[0].returnStatus, "已提交退货");
  const returnsByStatus = await agent.get("/api/returns?keyword=filled").expect(200);
  assert.equal(returnsByStatus.body[0].orderNo, "DF001");
  const pendingReturns = await agent.get(`/api/returns?status=${encodeURIComponent("已提交退货")}`).expect(200);
  assert.equal(pendingReturns.body[0].id, returnRecord.body.id);
  const arrangedReturn = await agent.patch(`/api/returns/${returnRecord.body.id}/status`).send({ status: "退回中" }).expect(200);
  assert.equal(arrangedReturn.body.status, "退回中");
  assert.equal(arrangedReturn.body.trackingNo, "SF123");
  const shippingScheduleAfterReturnOperation = await agent
    .get("/api/orders?orderType=dropship&status=filled&shippingSchedule=yes")
    .expect(200);
  assert.equal(shippingScheduleAfterReturnOperation.body.total, 0);
  await agent.delete(`/api/returns/${returnRecord.body.id}`).expect(409);
  const receivedReturn = await agent.patch(`/api/returns/${returnRecord.body.id}/status`).send({ status: "退货成功" }).expect(200);
  assert.equal(receivedReturn.body.status, "退货成功");
  const pendingReturnsAfterComplete = await agent.get(`/api/returns?status=${encodeURIComponent("已提交退货")}`).expect(200);
  assert.equal(pendingReturnsAfterComplete.body.length, 0);
  const returnOrders = await agent.get("/api/returns/orders?keyword=filled").expect(200);
  assert.equal(returnOrders.body[0].orderNo, "DF001");
  assert.equal(returnOrders.body[0].returnId, returnRecord.body.id);
  await agent
    .post("/api/returns")
    .field("storeName", "测试店铺")
    .field("orderNo", "DF001")
    .field("model", "默认规格")
    .field("customerName", "张三")
    .field("address", "上海市")
    .field("status", "已提交退货")
    .field("action", "自行寄回")
    .field("returnCarrier", "圆通快递")
    .field("trackingNo", "YT123")
    .field("reason", "质量问题")
    .expect(201);
  await agent.delete(`/api/orders/${order.body.id}/shipment`).expect(200);
  const afterDeleteShipment = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(afterDeleteShipment.body.status, "pending");
  assert.equal(afterDeleteShipment.body.shipments.length, 0);
  await agent.delete(`/api/orders/${order.body.id}/purchase-order`).expect(200);
  const afterDeletePurchaseOrder = await agent.get(`/api/orders/${order.body.id}`).expect(200);
  assert.equal(afterDeletePurchaseOrder.body.purchaseOrderNo, "");
  assert.equal(afterDeletePurchaseOrder.body.purchaseOrderUser, "");
  await agent.delete(`/api/orders/${order.body.id}`).expect(200);
  const replacementOrder = await agent
    .post("/api/orders")
    .send({
      orderNo: "DF001",
      orderType: "accessory",
      supplierId: supplier.body.id,
      storeName: "测试店铺",
      registrarName: "admin",
      customerName: "新客户",
      customerPhone: "13900000000",
      address: "北京市",
      items: [
        {
          productId: product.body.id,
          productName: product.body.name,
          productSku: product.body.sku,
          quantity: 1,
          unitCost: 10,
          unitSalePrice: 18
        }
      ]
    })
    .expect(201);
  const replacementRows = await agent.get("/api/orders?orderType=accessory&keyword=DF001").expect(200);
  assert.equal(replacementRows.body.rows[0].id, replacementOrder.body.id);
  assert.equal(replacementRows.body.rows[0].returnStatus, null);
  await agent.delete(`/api/products/${product.body.id}`).expect(409);
});

test("registered users must be authorized before accessing pages", async () => {
  const app = createApp();
  const admin = request.agent(app);
  const member = request.agent(app);
  await enableCsrf(admin);
  await enableCsrf(member);

  await member.post("/api/auth/register").send({ username: "member", password: "secret123456" }).expect(403);
  await member.post("/api/auth/login").send({ username: "member", password: "secret123456" }).expect(401);

  await admin.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);
  await admin.post("/api/auth/users").send({ username: "member", password: "secret123456" }).expect(201);
  const users = await admin.get("/api/auth/users").expect(200);
  const target = users.body.users.find((user: { username: string }) => user.username === "member");
  assert.ok(target);

  await admin.patch(`/api/auth/users/${target.id}/access`).send({ pageAccess: ["dropShippingRegistration"] }).expect(200);
  const login = await member.post("/api/auth/login").send({ username: "member", password: "secret123456" }).expect(200);
  assert.deepEqual(login.body.pageAccess, ["dropShippingRegistration"]);

  await member.get("/api/orders").expect(200);
  await member.get("/api/products").expect(200);
  await member.get("/api/dashboard/summary").expect(404);

  const supplier = await admin.post("/api/suppliers").send({ name: "权限测试供应商" }).expect(201);
  const product = await admin
    .post("/api/products")
    .send({ materialCode: "AUTH-MAT", productLine: "测试", series: "默认", ssku: "默认规格", name: "权限测试商品", supplierModel: "AUTH-001", supplierId: supplier.body.id })
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
  createUser("otherAdmin", "secret123456", "管理员", []);
  const otherAdmin = request.agent(app);
  await enableCsrf(otherAdmin);
  await otherAdmin.post("/api/auth/login").send({ username: "otherAdmin", password: "secret123456" }).expect(200);
  const operationRecords = await otherAdmin.get("/api/operation-records?keyword=AUTH-DELETE-001").expect(200);
  assert.ok(operationRecords.body.total >= 1);
  await otherAdmin.delete(`/api/operation-records/${operationRecords.body.rows[0].id}`).expect(403);
  await otherAdmin.delete(`/api/orders/${order.body.id}`).expect(403);
  await admin.delete(`/api/orders/${order.body.id}`).expect(200);
});

test("sessions persist across app restarts and IP changes", async () => {
  const app = createApp();
  const csrf = await csrfHeaders(app);
  const login = await request(app)
    .post("/api/auth/login")
    .set("Cookie", csrf.cookie)
    .set("x-csrf-token", csrf.token)
    .set("X-Forwarded-For", "10.0.0.1")
    .send({ username: "admin", password: "secret" })
    .expect(200);
  const cookie = [csrf.cookie, ...(login.headers["set-cookie"] ?? [])];
  assert.ok(cookie);

  const restartedApp = createApp();
  const me = await request(restartedApp)
    .get("/api/auth/me")
    .set("Cookie", cookie)
    .set("X-Forwarded-For", "10.0.0.1")
    .expect(200);
  assert.equal(me.body.user.username, "admin");
  assert.ok(me.body.user.pageAccess.includes("carrierLibrary"));

  const changedIp = await request(restartedApp)
    .get("/api/auth/me")
    .set("Cookie", cookie)
    .set("X-Forwarded-For", "10.0.0.2")
    .expect(200);
  assert.equal(changedIp.body.user.username, "admin");
});

test("imports suppliers, products and stores from Excel", async () => {
  const app = createApp();
  const agent = request.agent(app);
  await enableCsrf(agent);

  await agent.post("/api/auth/login").send({ username: "admin", password: "secret" }).expect(200);

  const suppliersFile = writeWorkbook("suppliers.xlsx", [
    { 供应商名称: "导入供应商A", 供应商简称: "导入A", 联系人: "王五", 电话: "13900000000", 店址: "杭州", 备注: "测试" }
  ]);
  await agent.post("/api/suppliers/import").attach("file", suppliersFile).expect(200);
  const suppliers = await agent.get("/api/suppliers").expect(200);
  assert.ok(suppliers.body.some((supplier: { name: string }) => supplier.name === "导入供应商A"));

  const productsFile = writeWorkbook("products.xlsx", [
    { 物料编码: "IMP-MAT-A", 产品线: "家居", 系列: "基础", SKU: "红色", 名称: "导入商品A", 供应商型号: "GYS-A", 供应商: "导入供应商A", 备注: "测试" }
  ]);
  await agent.post("/api/products/import").attach("file", productsFile).expect(200);
  const products = await agent.get("/api/products").expect(200);
  assert.ok(products.body.some((product: { name: string; ssku: string }) => product.name === "导入商品A" && product.ssku === "红色"));

  const minimalProductsFile = writeWorkbook("products-minimal.xlsx", [
    { SKU: "蓝色", 产品名称: "导入商品B", 供应商型号: "GYS-B" },
    { SKU: "蓝色", 产品名称: "导入商品B", 备注: "重复导入更新" }
  ]);
  await agent.post("/api/products/import").attach("file", minimalProductsFile).expect(200);
  await agent.post("/api/products/import").attach("file", minimalProductsFile).expect(200);
  const updatedProducts = await agent.get("/api/products").expect(200);
  const importedProduct = updatedProducts.body.find((product: { name: string; ssku: string }) => product.name === "导入商品B" && product.ssku === "蓝色");
  assert.equal(importedProduct.materialCode, "蓝色");
  assert.equal(importedProduct.note, "重复导入更新");

  const storesFile = writeWorkbook("stores.xlsx", [{ 店铺名称: "导入店铺A", 店铺简称: "店A", 平台: "淘宝", 运营: "赵六", 备注: "测试" }]);
  await agent.post("/api/stores/import").attach("file", storesFile).expect(200);
  const stores = await agent.get("/api/stores").expect(200);
  assert.ok(stores.body.some((store: { name: string; platform: string }) => store.name === "导入店铺A" && store.platform === "淘宝"));
});

test.after(() => {
  closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });
});
