export type OrderStatus = "pending" | "shipped" | "exception" | "cancelled";

export type ProductStatus = "active" | "inactive";

export interface SessionUser {
  username: string;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}
