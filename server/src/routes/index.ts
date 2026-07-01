import { Router } from "express";
import { authRouter, requireAuth, requirePage } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { productsRouter } from "./products.js";
import { suppliersRouter } from "./suppliers.js";
import { ordersRouter } from "./orders.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use("/dashboard", requirePage("dashboard"), dashboardRouter);
apiRouter.use("/products", requirePage("products"), productsRouter);
apiRouter.use("/suppliers", requirePage("suppliers"), suppliersRouter);
apiRouter.use("/orders", requirePage("orders"), ordersRouter);
