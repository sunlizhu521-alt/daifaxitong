# 一件代发系统

前后端一体的后台业务系统，覆盖商品/SKU、供应商、订单、发货、物流跟踪、Excel 导入导出和经营概览。

## 技术栈

- 前端：React、Vite、TypeScript、React Router、TanStack Query
- 后端：Node.js、Express、TypeScript、SQLite、Zod、Multer
- 数据库：SQLite，默认路径为 `server/data/daifa.sqlite`

## 本地运行

1. 复制 `.env.example` 为 `.env`。
2. 为 `ADMIN_PASSWORD` 设置至少 12 个字符的独立强密码。
3. 为 `SESSION_SECRET` 设置至少 32 个字符的随机值。
4. 初始化并启动项目：

```bash
npm install
npm run db:init
npm run dev
```

可使用密码管理器生成管理员密码，并使用以下命令生成会话密钥：

```bash
openssl rand -base64 48
```

不要把 `.env`、密码、Webhook、Token、Secret、业务数据库或上传附件提交到 Git。

## 生产安全要求

- 必须通过 HTTPS 反向代理访问，不要直接向公网开放 Node 服务端口。
- 生产环境设置 `NODE_ENV=production` 和 `COOKIE_SECURE=true`。
- `TRUST_PROXY` 只填写实际可信的反向代理范围，默认仅信任本机回环代理。
- 通知机器人和快递接口凭据只能通过环境变量或 GitHub Secrets 注入。
- 如果凭据曾进入 Git 历史，应先在对应平台轮换，再考虑清理历史。

## 数据保护

`server/data`、`server/uploads` 和 `server/backups` 都是运行时目录，不进入 Git。任何部署、初始化、迁移或重启前，都必须先建立经过完整性验证、位于发布目录之外的备份，并确认回滚步骤。

不要在包含真实业务数据的环境中直接执行未经审查的 `npm run db:init`、迁移或全量测试。

## GitHub Actions 配置

在仓库环境 `production` 中配置以下 Secrets：

```text
SERVER_HOST
SERVER_USER
SERVER_SSH_KEY
SERVER_SSH_PORT
DEPLOY_PATH
ADMIN_USERNAME
ADMIN_PASSWORD
SESSION_SECRET
DINGTALK_WEBHOOK
DINGTALK_SECRET
RETURN_DINGTALK_WEBHOOK
RETURN_DINGTALK_SECRET
REPAIR_DINGTALK_WEBHOOK
REPAIR_DINGTALK_SECRET
FEISHU_WEBHOOK
FEISHU_SECRET
KUAIDI100_CUSTOMER
KUAIDI100_KEY
```

部署工作流不会打包 `.env`、数据库、上传附件或日志。推送或手动部署前仍需单独验证线上备份及恢复能力。
