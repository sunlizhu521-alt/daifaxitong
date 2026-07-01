import { Router } from "express";
import { authRouter, requireAuth, requireAnyPage, requirePage } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { productsRouter } from "./products.js";
import { suppliersRouter } from "./suppliers.js";
import { ordersRouter } from "./orders.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use("/dashboard", requirePage("dashboard"), dashboardRouter);
apiRouter.use("/products", requireAnyPage(["productLibrary", "dropShippingRegistration"]), productsRouter);
apiRouter.use("/suppliers", requireAnyPage(["suppliers", "dropShippingRegistration"]), suppliersRouter);
apiRouter.use("/orders", requireAnyPage(["dropShippingRegistration", "trackingNumbers"]), ordersRouter);
