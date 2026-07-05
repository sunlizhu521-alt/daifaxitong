import { Router } from "express";
import { authRouter, requireAuth, requireAnyPage } from "./auth.js";
import { productsRouter } from "./products.js";
import { suppliersRouter } from "./suppliers.js";
import { ordersRouter } from "./orders.js";
import { storesRouter } from "./stores.js";
import { returnsRouter } from "./returns.js";
import { carriersRouter } from "./carriers.js";
import { operationRecordsRouter } from "./operationRecords.js";
import { backupsRouter } from "./backups.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use("/products", requireAnyPage(["productLibrary", "dropShippingRegistration", "accessoryRegistration", "accessoryShipping", "trackingNumbers", "returnRegistration", "shippingSchedule", "purchaseOrders", "dropshipSummary"]), productsRouter);
apiRouter.use("/suppliers", requireAnyPage(["suppliers", "dropShippingRegistration", "accessoryRegistration", "accessoryShipping", "trackingNumbers", "shippingSchedule", "purchaseOrders", "dropshipSummary", "accessorySummary", "returnRegistration"]), suppliersRouter);
apiRouter.use("/orders", requireAnyPage(["dropShippingRegistration", "accessoryRegistration", "accessoryShipping", "trackingNumbers", "shippingSchedule", "purchaseOrders", "dropshipSummary", "accessorySummary", "returnRegistration"]), ordersRouter);
apiRouter.use("/carriers", requireAnyPage(["carrierLibrary", "accessoryShipping", "trackingNumbers", "shippingSchedule"]), carriersRouter);
apiRouter.use("/stores", requireAnyPage(["storeLibrary", "dropShippingRegistration", "accessoryRegistration", "trackingNumbers", "returnRegistration", "dropshipSummary", "accessorySummary", "purchaseOrders"]), storesRouter);
apiRouter.use("/returns", requireAnyPage(["returnRegistration", "returnOperation", "returnReceipt"]), returnsRouter);
apiRouter.use("/operation-records", requireAnyPage(["operationRecords"]), operationRecordsRouter);
apiRouter.use("/backups", requireAnyPage(["backupCenter"]), backupsRouter);
