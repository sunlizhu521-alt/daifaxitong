import { Router } from "express";
import { authRouter, requireAuth, requireAnyPage, requirePage } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { productsRouter } from "./products.js";
import { suppliersRouter } from "./suppliers.js";
import { ordersRouter } from "./orders.js";
import { storesRouter } from "./stores.js";
import { returnsRouter } from "./returns.js";
import { carriersRouter } from "./carriers.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use("/dashboard", requirePage("dashboard"), dashboardRouter);
apiRouter.use("/products", requireAnyPage(["productLibrary", "dropShippingRegistration", "returnRegistration", "shippingSchedule"]), productsRouter);
apiRouter.use("/suppliers", requireAnyPage(["suppliers", "dropShippingRegistration", "shippingSchedule", "returnRegistration"]), suppliersRouter);
apiRouter.use("/orders", requireAnyPage(["dropShippingRegistration", "trackingNumbers", "shippingSchedule", "returnRegistration"]), ordersRouter);
apiRouter.use("/carriers", requireAnyPage(["carrierLibrary", "trackingNumbers", "shippingSchedule"]), carriersRouter);
apiRouter.use("/stores", requireAnyPage(["storeLibrary", "returnRegistration"]), storesRouter);
apiRouter.use("/returns", requirePage("returnRegistration"), returnsRouter);
