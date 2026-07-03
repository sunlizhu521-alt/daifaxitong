export type OrderStatus = "pending" | "filled" | "purchased" | "shipped" | "exception" | "cancelled" | "customer_cancelled";

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
