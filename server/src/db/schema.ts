export const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  phone TEXT,
  address TEXT,
  settlementType TEXT,
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT NOT NULL,
  costPrice REAL NOT NULL DEFAULT 0,
  salePrice REAL NOT NULL DEFAULT 0,
  supplierId INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (supplierId) REFERENCES suppliers(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_name_sku ON products(name, sku);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderNo TEXT NOT NULL UNIQUE,
  customerName TEXT NOT NULL,
  customerPhone TEXT,
  address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  productId INTEGER,
  productName TEXT NOT NULL,
  productSku TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unitCost REAL NOT NULL DEFAULT 0,
  unitSalePrice REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (productId) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId INTEGER NOT NULL,
  supplierId INTEGER,
  carrier TEXT NOT NULL,
  trackingNo TEXT NOT NULL,
  shippedAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'shipped',
  note TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (supplierId) REFERENCES suppliers(id)
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  filename TEXT NOT NULL,
  totalRows INTEGER NOT NULL,
  successRows INTEGER NOT NULL,
  failedRows INTEGER NOT NULL,
  errorJson TEXT,
  createdAt TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
