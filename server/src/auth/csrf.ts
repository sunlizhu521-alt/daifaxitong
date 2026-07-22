import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function tokensMatch(cookieToken: string, headerToken: string) {
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && crypto.timingSafeEqual(cookieBuffer, headerBuffer);
}

export function csrfProtect(req: Request, res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    let token = req.cookies?.[CSRF_COOKIE];
    if (!token) {
      token = generateToken();
      res.cookie(CSRF_COOKIE, token, {
        httpOnly: false,
        sameSite: "strict",
        secure: req.secure || req.get("x-forwarded-proto") === "https",
        maxAge: 24 * 60 * 60 * 1000
      });
    }
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.headers[CSRF_HEADER] as string | undefined;

  if (!cookieToken || !headerToken || !tokensMatch(cookieToken, headerToken)) {
    res.status(403).json({ message: "CSRF 校验失败，请刷新页面后重试" });
    return;
  }
  next();
}
