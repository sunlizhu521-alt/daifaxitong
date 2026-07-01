import { Router } from "express";
import type { RequestHandler } from "express";
import { z } from "zod";
import { createUser, deleteUser, ensureAdminUser, getUserById, getUserByUsername, listUsers, toPublicUser, updateUserAccess } from "../auth/users.js";
import { verifyPassword } from "../auth/password.js";
import { allPageKeys, hasPageAccess, pageOptions, ROLE_ADMIN, type PageKey } from "../permissions.js";
import { getRequestIp } from "../sessionStore.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().trim().min(1, "账号不能为空"),
  password: z.string().min(1, "密码不能为空")
});

const registerSchema = z.object({
  username: z.string().trim().min(2, "账号至少 2 个字符"),
  password: z.string().min(6, "密码至少 6 个字符")
});

const accessSchema = z.object({
  pageAccess: z.array(z.string()).default([])
});

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.session.user) {
    res.status(401).json({ message: "请先登录" });
    return;
  }
  next();
};

export function requirePage(page: PageKey): RequestHandler {
  return (req, res, next) => {
    if (!req.session.user) {
      res.status(401).json({ message: "请先登录" });
      return;
    }
    if (!hasPageAccess(req.session.user, page)) {
      res.status(403).json({ message: "当前账号没有访问该页面的权限，请联系管理员授权" });
      return;
    }
    next();
  };
}

export function requireAnyPage(pages: PageKey[]): RequestHandler {
  return (req, res, next) => {
    if (!req.session.user) {
      res.status(401).json({ message: "请先登录" });
      return;
    }
    if (!pages.some((page) => hasPageAccess(req.session.user, page))) {
      res.status(403).json({ message: "当前账号没有访问该页面的权限，请联系管理员授权" });
      return;
    }
    next();
  };
}

const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.session.user?.role !== ROLE_ADMIN || !hasPageAccess(req.session.user, "permissionManagement")) {
    res.status(403).json({ message: "只有管理员可以管理权限" });
    return;
  }
  next();
};

authRouter.post("/login", (req, res) => {
  ensureAdminUser();
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "账号和密码不能为空" });
    return;
  }

  const user = getUserByUsername(parsed.data.username);
  if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
    res.status(401).json({ message: "账号或密码错误" });
    return;
  }

  const publicUser = toPublicUser(user);
  if (publicUser.role !== ROLE_ADMIN && publicUser.pageAccess.length === 0) {
    res.status(403).json({ message: "账号已注册，请等待管理员授权页面后再登录" });
    return;
  }

  req.session.user = {
    id: publicUser.id,
    username: publicUser.username,
    role: publicUser.role,
    pageAccess: publicUser.pageAccess
  };
  req.session.loginIp = getRequestIp(req);
  res.json(publicUser);
});

authRouter.post("/register", (req, res) => {
  res.status(403).json({ message: "新用户只能由管理员创建" });
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

authRouter.get("/pages", (_req, res) => {
  res.json({ pages: pageOptions });
});

authRouter.get("/users", requireAuth, requireAdmin, (_req, res) => {
  res.json({ users: listUsers(), pages: pageOptions });
});

authRouter.post("/users", requireAuth, requireAdmin, (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "创建用户参数错误" });
    return;
  }
  try {
    res.status(201).json(createUser(parsed.data.username, parsed.data.password));
  } catch {
    res.status(409).json({ message: "账号已存在" });
  }
});

authRouter.patch("/users/:id/access", requireAuth, requireAdmin, (req, res) => {
  const parsed = accessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "页面权限参数错误" });
    return;
  }
  const userId = String(req.params.id);
  const user = updateUserAccess(userId, parsed.data.pageAccess);
  if (!user) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  if (req.session.user?.id === user.id) {
    req.session.user.pageAccess = user.pageAccess;
  }
  res.json(user);
});

authRouter.delete("/users/:id", requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.params.id);
  const target = getUserById(userId);
  if (!target) {
    res.status(404).json({ message: "用户不存在" });
    return;
  }
  if (target.role === ROLE_ADMIN) {
    res.status(409).json({ message: "管理员账号不能删除" });
    return;
  }
  deleteUser(userId);
  res.json({ ok: true });
});

export function firstAllowedPath(user: { pageAccess?: string[] }) {
  const first = pageOptions.find((page) => user.pageAccess?.includes(page.key) && allPageKeys.includes(page.key));
  return first?.path ?? "/";
}
