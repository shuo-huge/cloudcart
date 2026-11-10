---
title: 本地开发
description: 在本地运行 CloudCart，修改代码并使用本地 D1 调试。
---

## 环境要求

- Node.js 20+（CI 使用 24，`.nvmrc` 固定 22）
- pnpm 10+（`packageManager` 固定 12.16.1）
- 可选：Cloudflare 账号，用于真实部署

## 启动

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm db:migrate:local
pnpm dev
```

`pnpm dev` 会：

1. 在本地生成 `.dev.vars` 随机密钥（已有值会保留）
2. 构建前台和后台
3. 启动 `wrangler dev`
4. 输出一次性安装链接

打开终端里输出的 `/setup?token=...` 创建管理员。

| 地址 | 用途 |
|---|---|
| `/` | 商城前台 |
| `/admin` | 后台 SPA |
| `/setup` | 一次性初始化 |
| `/api/*` | 公开与后台 API |
| `/webhooks/stripe`、`/webhooks/paypal` | 支付回调 |

## 常用命令

```bash
pnpm typecheck                 # TypeScript 检查
pnpm test                      # Vitest（workerd + 真实 D1）
pnpm build                     # 构建前台、后台和资源清单
pnpm exec playwright install chromium
pnpm test:e2e                  # Playwright 浏览器测试
pnpm db:migrate:local          # 应用本地 D1 迁移
```

## 修改代码时

- Worker/API：`apps/worker/src`
- 后台页面：`apps/admin/src`
- 业务逻辑：`packages/core/src`
- 主题：`themes/*/src/index.ts`
- 插件：`plugins/**`
- 数据库迁移：`migrations/*.sql`

修改后台后需要重新构建：

```bash
pnpm build:admin
```

修改主题或 Worker 后，`wrangler dev` 会自动重新加载。

## 重置本地数据

本地 D1 数据位于 `.wrangler/state`。需要完全重来时删除该目录并重新迁移：

```bash
rm -rf .wrangler/state
pnpm db:migrate:local
```

Windows PowerShell：

```powershell
Remove-Item -Recurse -Force .wrangler\state
pnpm db:migrate:local
```
