# 一件代发系统

一个前后端一体的后台业务系统，覆盖商品/SKU、供应商、订单、发货、物流跟踪、Excel 导入导出和首页经营概览。

## 技术栈

- 前端：React、Vite、TypeScript、React Router、TanStack Query、lucide-react
- 后端：Node.js、Express、TypeScript、SQLite、Zod、Multer、xlsx
- 数据库：SQLite 文件数据库，默认路径 `server/data/daifa.sqlite`

## 本地运行

```bash
npm install
npm run db:init
npm run dev
```

- 前端开发服务：http://localhost:5173
- 后端 API：http://localhost:3000/api

## 生产运行

```bash
npm install
npm run db:init
npm run build
npm start
```

生产模式由 Express 服务托管 API 和前端静态文件，默认访问地址为 http://localhost:3000。

## 默认账号

复制 `.env.example` 为 `.env` 后修改：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
SESSION_SECRET=change-me
```

## 数据备份

长期部署时请定期备份 `server/data/daifa.sqlite`。该目录属于运行时数据，不提交到 Git。

## 自动部署到服务器

仓库已配置 GitHub Actions：推送到 `main` 或 `master` 后，会先执行测试和构建，再通过 SSH 部署到 `http://129.211.9.242:4006/`。

### GitHub Secrets

在 GitHub 仓库 `Settings -> Secrets and variables -> Actions` 中添加：

```text
SERVER_USER=服务器 SSH 用户名
SERVER_SSH_KEY=服务器 SSH 私钥
SERVER_SSH_PORT=22
DEPLOY_PATH=/www/wwwroot/daifaxitong
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请改成强密码
SESSION_SECRET=请改成随机长字符串
```

`DEPLOY_PATH` 可按服务器实际目录调整；不设置时默认使用 `/www/wwwroot/daifaxitong`。

### 服务器前置条件

服务器需要安装：

```bash
git --version
node -v
npm -v
```

Node.js 建议使用 20 或 22。部署脚本会自动执行：

```bash
npm ci
npm run db:init
npm run build
pm2 startOrReload ecosystem.config.cjs --env production
```

服务端口固定为 `4006`，健康检查地址为：

```text
http://127.0.0.1:4006/api/health
```

如果服务器开启防火墙或安全组，需要放行 TCP `4006` 端口。
