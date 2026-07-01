import { Router } from "express";
import { authRouter, requireAuth } from "./auth.js";
import { dashboardRouter } from "./dashboard.js";
import { productsRouter } from "./products.js";
import { suppliersRouter } from "./suppliers.js";
import { ordersRouter } from "./orders.js";

export const apiRouter = Router();

apiRouter.get("/health", (_req, res) => res.json({ ok: true }));
apiRouter.use("/auth", authRouter);
apiRouter.use(requireAuth);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/suppliers", suppliersRouter);
apiRouter.use("/orders", ordersRouter);
