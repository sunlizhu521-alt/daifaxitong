export type OrderStatus = "pending" | "filled" | "shipped" | "exception" | "cancelled";

export type ProductStatus = "active" | "inactive";

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  pageAccess: string[];
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    loginIp?: string;
  }
}
