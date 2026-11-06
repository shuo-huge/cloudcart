<div align="center">

# CloudCart

**免费、开源、插件化的电商系统，原生运行在 Cloudflare Workers 上。**

一个 Worker · 一个 D1 数据库 · 一个 R2 存储桶 · 每月托管费用 0 元

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![D1](https://img.shields.io/badge/Database-D1-0051FF)](https://developers.cloudflare.com/d1/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[English](README.md) · [简体中文](README.zh-CN.md) · [架构文档](docs/ARCHITECTURE.md) · [部署文档](docs/DEPLOYMENT.md)

</div>

---

## 为什么做 CloudCart？

开一个小网店，不应该在产品还没卖出去之前先交一堆月费。

大多数电商方案都会逼你三选一：交平台月费、自己维护服务器、或者放弃数据控制权。CloudCart 用 Cloudflare 免费额度作为整套运行时——边缘计算、SQLite、对象存储、静态资源——把这道选择题直接去掉。

### 它解决的痛点

| 痛点 | CloudCart 的做法 |
|---|---|
| **Shopify 式月费 + 付费插件** | 没有平台订阅费。运行在 Cloudflare Workers Free 上，你只需要付域名和支付渠道手续费。 |
| **VPS、MySQL、Redis、SSL、备份** | 没有服务器要维护。D1 和 R2 由 Cloudflare 托管，D1 可随时导出 SQL 备份。 |
| **SaaS 锁定、多租户共享数据** | 每个商城都是你自己 Cloudflare 账户里的独立 Worker + D1 + R2。数据、代码、域名都归你。 |
| **重型 SSR 框架超出免费 CPU 限制** | Hono + Preact + 轻量字符串渲染，页面依然服务端渲染、SEO 可读。 |
| **主题和页面编辑器贵且封闭** | 8 套结构不同的内置主题、三栏可视化编辑器、完整 Theme SDK，MIT 开源。 |
| **支付插件依赖付费后端** | 内置人工支付、Stripe Checkout、PayPal Orders v2，密钥使用 AES-GCM 加密。 |
| **后台只有英文** | 内置 Admin Language Pack，支持 English / 简体中文，可运行时切换。 |
| **假“一键部署”** | 这里列出的功能都真实实现。测试在 workerd 中连接真实 D1/R2 运行；未完成项明确列出。 |

### 和常见方案对比

| | **CloudCart** | Shopify | WooCommerce |
|---|---|---|---|
| 平台月费 | **0 元**（Cloudflare 免费额度） | 订阅费 + 付费 App | 软件免费，托管付费 |
| 托管 | Cloudflare 边缘网络 | 包含 | VPS（$5–20+/月） |
| 数据库 | D1（SQLite），包含 | 平台托管 | 自己维护 MySQL |
| 数据归属 | **你的 Cloudflare 账户** | 平台 | 自己 |
| 多商城 | 每店独立 Worker + D1 + R2 | 套餐/租户限制 | 每站点独立安装 |
| 主题 | 8 套内置 + SDK | 多为付费 | 免费/付费扩展 |
| 可视化编辑器 | 内置 | 内置 | 第三方 |
| 开源 | **MIT** | 否 | GPL |

---

## 一键部署到 Cloudflare

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/shuo-huge/cloudcart)

点击按钮后，Cloudflare 会把仓库克隆到**你的账户**下的 Workers Builds，读取 `wrangler.jsonc`，自动创建 D1 数据库和 R2 存储桶，并执行项目的 `build`、`deploy` 脚本。

部署前需要填写 `.dev.vars.example` 中的两个密钥：

| 密钥 | 用途 |
|---|---|
| `APP_MASTER_KEY` | 签名 Session、加密支付凭证。请生成足够长的随机值。 |
| `SETUP_TOKEN` | 一次性初始化令牌，用于创建第一个管理员。 |

生成方式：

```bash
openssl rand -base64 48   # APP_MASTER_KEY
openssl rand -base64 32   # SETUP_TOKEN
```

PowerShell：

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

如果仍使用示例占位密钥，CloudCart 会拒绝完成初始化。

部署完成后打开 `https://<你的-worker>.workers.dev/setup`，填入 `SETUP_TOKEN` 创建店主账号。**系统没有默认管理员密码。** 初始化完成后设置页会永久关闭。

> **诚实说明：** Cloudflare 的一键按钮可以自动创建 D1/R2，但实际行为取决于你的账户和当前 Cloudflare 功能。如果资源创建或密钥配置失败，请使用下面的 CLI 完整部署。CloudCart 不会自动升级你的付费计划。

---

## CLI 部署（推荐，最完整）

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm run deploy:cloudflare
```

脚本会依次检查 Node、Wrangler 和 Cloudflare 登录状态，然后：

1. 查找或创建 D1 数据库；
2. 查找或创建 R2 存储桶；
3. 把真实 ID 写入 `wrangler.jsonc`；
4. 构建前台和后台；
5. 执行远程数据库迁移；
6. 部署 Worker；
7. 如不存在则生成 `APP_MASTER_KEY` 和 `SETUP_TOKEN`；
8. 输出商城地址、后台地址和一次性初始化链接。

可重复执行：已有资源和密钥会复用，不会覆盖业务数据。

```bash
pnpm run deploy:cloudflare -- --name my-store   # 指定 Worker/资源名称
pnpm run deploy:cloudflare -- --check           # 只检查环境，不修改资源
```

---

## 本地开发

要求：Node.js 20+、pnpm 10+。

```bash
pnpm install
cp .dev.vars.example .dev.vars    # 修改两个密钥
pnpm db:migrate:local
pnpm build
pnpm dev
```

打开 <http://localhost:8787/setup>，使用 `.dev.vars` 里的 `SETUP_TOKEN` 初始化。

| 地址 | 用途 |
|---|---|
| `/` | 服务端渲染商城 |
| `/admin` | 后台管理 SPA |
| `/setup` | 一次性初始化 |
| `/api/*` | 公开与后台 API |
| `/webhooks/stripe`, `/webhooks/paypal` | 支付回调 |

---

## 功能

### 商城前台
首页、分类、搜索、商品详情、购物车、结账、订单确认、内容页全部服务端渲染。内置 Meta 标签、Canonical、Open Graph、Twitter Card、商品/面包屑/网站 JSON-LD、`sitemap.xml`、`robots.txt`、301 重定向。不依赖 JavaScript 也能被抓取商品名称和描述。

### 后台
Dashboard、商品与规格、分类、图片（R2）、订单、客户、优惠券、配送区域与运费、主题、可视化页面编辑器、插件、支付配置、媒体库、店铺设置、SEO 重定向、审计日志、资源用量估算。

### 交易核心
每次结账都在服务端重新校验价格、库存、优惠和运费。金额使用整数最小货币单位，保存订单快照，库存使用条件更新与补偿机制，订单状态机显式约束，人工确认收款记录管理员和时间，支持手动填写物流单号。

### 8 套内置主题
Default、Fashion、Beauty、Electronics、Jewelry、Home、Sports、Single Product。每套主题的布局、字体、商品卡片结构都不同，而不是只换颜色；全部接入同一套 Theme SDK 和设计变量。

| Default | Fashion | Electronics | Sports |
|---|---|---|---|
| ![Default](apps/storefront/public/themes/default.svg) | ![Fashion](apps/storefront/public/themes/fashion.svg) | ![Electronics](apps/storefront/public/themes/electronics.svg) | ![Sports](apps/storefront/public/themes/sports.svg) |

### 可视化页面编辑器
三栏布局，SortableJS 拖拽排序，新增/删除/复制/隐藏模块，模块内容与样式配置，桌面/平板/手机实时预览，自动保存草稿，撤销/重做，发布并生成不可变版本快照。页面 JSON 服务端校验，自定义 HTML 严格消毒。

![中文后台登录](docs/images/admin-login-zh.png)

### 支付
- **人工支付**：银行转账、货到付款、自定义说明，管理员确认收款并写入审计。
- **Stripe Checkout**：原始请求体验签、金额/币种核对、事件幂等。
- **PayPal Orders v2**：服务端 Capture、PayPal 验签 API、金额核对。

支付密钥使用由 `APP_MASTER_KEY` 派生的 AES-GCM 密钥加密，永远不会返回浏览器。

### 插件
构建时打包、运行时启停、设置保存在 D1。未打包进当前 Worker 的插件无法启用。内置：Manual、Stripe、PayPal，以及 **Admin Language Pack**（English / 简体中文，可配置默认语言和切换器）。

### 安全
PBKDF2 密码、HMAC Session、CSRF 双提交、登录限流、全部预编译 SQL、HTML 白名单消毒、图片魔数校验、开放重定向防护、Webhook 验签、审计日志。

---

## 架构概览

```
浏览器
  └─ Cloudflare 边缘
       ├─ Workers Static Assets     /static/*, /static/admin-ui/*
       └─ Worker (Hono)             /, /api/*, /admin, /media/*, /webhooks/*
            ├─ D1 (SQLite)          商品、订单、页面、设置、会话…
            └─ R2                    商品图片与上传文件
```

```
apps/worker       Hono API、SSR、Webhook、媒体、后台壳
apps/admin        Preact 后台 SPA 与页面编辑器
apps/storefront   小型前台脚本（购物车、订阅）
packages/core     商品、订单、支付、页面、主题、SEO 等业务逻辑
packages/database D1 封装、行类型、资源保护
packages/security Web Crypto、会话、密钥加密、消毒
packages/shared   金额、ID、Slug、类型
packages/plugin-sdk, theme-sdk, ui
plugins/          admin/i18n、payments/{manual,stripe,paypal}
themes/           8 套内置主题
migrations/       3 个 D1 迁移
scripts/          部署 CLI 与资源准备
tests/            workerd 集成测试
docs/             架构、插件、主题、支付、部署、安全、测试文档
```

完整设计、订单状态机、支付事件流水线和免费额度策略见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 项目状态

**v0.1.0 — 功能可用，但尚未宣称 1.0。** 已实现和未实现的事项都明确列出。

已实现并通过测试：初始化/登录/CSRF、商品/分类/图片、服务端购物车、访客结账、库存预占、人工支付、订单履约、8 套主题、页面编辑器草稿/预览/发布、Stripe 验签与幂等、PayPal 下单/Capture/Webhook 验签、后台语言包、24 个 workerd 测试。

未验证或尚未完成：
- 仓库内**没有对真实 Stripe/PayPal Sandbox 发起过交易**；测试中支付接口使用确定性 mock。
- 构建本版本时**没有真正执行过 Cloudflare 部署**；部署 CLI 的环境检查已通过。
- PayPal 使用托管审批跳转，不是嵌入式 Smart Buttons。
- 暂无邮件发送、税费计算、页面版本回滚、图片排序。
- 主题预览是原创 SVG 素材，不是真实店铺截图。

精确验证矩阵和已知缺口见 [docs/TEST_REPORT.md](docs/TEST_REPORT.md)。

---

## 文档

- [产品需求 PRD](docs/PRD.md)
- [架构](docs/ARCHITECTURE.md)
- [插件开发](docs/PLUGIN_DEVELOPMENT.md)
- [主题开发](docs/THEME_DEVELOPMENT.md)
- [支付接入](docs/PAYMENT_INTEGRATION.md)
- [部署](docs/DEPLOYMENT.md)
- [安全](docs/SECURITY.md)
- [免费额度预算](docs/FREE_TIER_BUDGET.md)
- [测试报告](docs/TEST_REPORT.md)

---

## 参与贡献

项目使用 MIT 协议。欢迎提交主题、插件、翻译、Bug 报告和性能改进。

- 新增主题：[docs/THEME_DEVELOPMENT.md](docs/THEME_DEVELOPMENT.md)
- 新增插件：[docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md)
- 安全问题请私下报告，不要直接开公开 Issue。
- 如果这个项目帮你省下了每月账单，点一个 Star 能让更多人看到它。

## License

MIT，详见 [LICENSE](LICENSE)。第三方依赖遵循各自许可证。
