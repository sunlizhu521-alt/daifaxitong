import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { config } from "../config.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.user) {
    res.status(401).json({ message: "请先登录" });
    return;
  }
  next();
};

authRouter.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "账号和密码不能为空" });
    return;
  }
  const { username, password } = parsed.data;
  if (username !== config.adminUsername || password !== config.adminPassword) {
    res.status(401).json({ message: "账号或密码错误" });
    return;
  }
  req.session.user = { username };
  res.json({ username });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("daifa.sid");
    res.json({ ok: true });
  });
});

authRouter.get("/me", (req, res) => {
  res.json({ user: req.session.user ?? null });
});
