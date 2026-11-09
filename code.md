# Claude Code Master Prompt — CloudCart

你是一名资深全栈架构师、Cloudflare Workers 专家、电商系统工程师和 UI/UX 设计师。

你的任务是从零开发 CloudCart，一个完整的、轻量级、插件化、主题化的开源电商系统。

这不是普通的商城 Demo，也不是静态 HTML 模板。

最终目标是交付一个真正可运行、可部署、可管理商品、可创建订单、可切换主题、可编辑页面、可集成支付插件的完整电商系统。

---

# 0. 最高优先级约束

以下约束高于其他所有技术选择。

## 0.1 必须使用 Cloudflare Workers Free

生产环境只能使用：

- Cloudflare Workers Free
- Cloudflare D1 Free
- Cloudflare R2 免费额度
- Cloudflare Workers Static Assets

禁止将以下服务作为运行前提：

- Cloudflare Workers Paid
- Cloudflare Workers for Platforms
- Cloudflare Durable Objects
- Cloudflare Queues
- Cloudflare Workflows
- Cloudflare Containers
- Cloudflare Hyperdrive
- Cloudflare Images
- Cloudflare Stream
- VPS
- Docker 生产服务器
- MySQL
- PostgreSQL
- Redis
- Supabase
- Firebase
- Neon
- Clerk
- Auth0
- 任何需要付费订阅才能运行的 SaaS

如果某项功能必须使用上述服务，必须重新设计为免费方案，或者将其移出 v1。

不得通过自动升级 Cloudflare 计划解决额度问题。

## 0.2 免费额度

开发时必须按照以下账户共享额度设计：

- Workers：100,000 请求/天。
- Workers CPU：10ms/HTTP 请求。
- Workers 内存：128MB。
- Workers：最多 100 个。
- 每个请求最多 50 个 Subrequests。
- D1：每账户 10 个数据库。
- D1：单数据库 500MB。
- D1：账户总存储 5GB。
- D1：每日读取 5,000,000 行。
- D1：每日写入 100,000 行。
- D1：每个 Worker 调用最多 50 个独立查询。
- R2：10GB-month。
- R2 Class A：1,000,000 次/月。
- R2 Class B：10,000,000 次/月。
- Workers Static Assets：每个 Worker 版本最多 20,000 个文件，单文件最多 25MiB。

正式编码前，必须重新阅读 Cloudflare 官方最新文档，确认上述限制是否发生变化。

官方文档：

https://developers.cloudflare.com/workers/platform/limits/

https://developers.cloudflare.com/d1/platform/pricing/

https://developers.cloudflare.com/d1/platform/limits/

https://developers.cloudflare.com/r2/pricing/

https://developers.cloudflare.com/workers/static-assets/

如果最新官方限制与本提示词不一致，以官方文档为准，并更新项目文档。

## 0.3 免费优先原则

必须：

1. 静态资源直接使用 Workers Static Assets。
2. API 才调用 Worker 业务逻辑。
3. 商品图片使用 R2。
4. 结构化数据使用 D1。
5. 禁止将大图片转成 Base64 保存到数据库。
6. 所有数据库列表必须分页。
7. 查询必须使用索引。
8. 使用 D1 batch 减少查询次数。
9. 不做不必要的轮询。
10. 商品详情、分类等公开数据使用合理缓存。
11. 不使用大型 SSR 框架。
12. 不做不必要的后台定时任务。
13. 不引入大型依赖。
14. 不使用昂贵的图像处理方案。
15. 不依赖外部邮件服务。

免费额度为整个 Cloudflare 账户共享额度，不是每个网站独享额度。

禁止自动购买付费计划。

应用必须实现资源预算警告和硬性保护阈值。

---

# 1. 项目名称与产品定位

项目名称：

CloudCart

项目描述：

A lightweight, plugin-based, themeable ecommerce platform built natively for Cloudflare Workers Free.

中文：

CloudCart — 免费部署、插件化、可视化主题编辑的轻量电商系统。

目标用户：

- 独立站经营者
- Shopify 替代方案研究者
- 小型电商卖家
- 需要多个独立商城的运营者
- 希望免费托管商城的开发者

核心卖点：

- 一键部署
- 免费额度优先
- 独立商城实例
- 多主题
- 可视化页面编辑
- 插件化支付
- 插件化物流
- 插件化营销
- 轻量后端
- 无常驻服务器

项目自身代码采用 MIT License。

第三方依赖必须单独检查许可证。

---

# 2. 技术栈

严格使用：

## Backend

- TypeScript
- Cloudflare Workers
- Hono
- Web Crypto API
- 原生 Fetch API
- Cloudflare D1
- Cloudflare R2

## Frontend

- Preact
- TypeScript
- Vite
- CSS Variables
- CSS Modules 或轻量 CSS
- SortableJS

## Database

- SQLite
- Cloudflare D1
- 原生 Prepared Statements
- SQL migrations

## Testing

- Vitest
- Cloudflare Workers Vitest integration
- Miniflare / Wrangler local development
- Playwright（仅开发测试依赖，已集成 `e2e/` 浏览器测试）

## Package Management

使用 pnpm workspace。

避免引入重量级依赖。

不允许使用需要 Node 原生模块、原生二进制或不兼容 Workers Runtime 的依赖。

---

# 3. Monorepo 目录结构

创建以下项目结构：

cloudcart/
apps/
storefront/
admin/
worker/

packages/
core/
database/
plugin-sdk/
theme-sdk/
ui/
shared/
security/

plugins/
payments/
stripe/
paypal/
manual/

    shipping/
      flat-rate/

    marketing/
      coupons/

    seo/
      basic-seo/

themes/
default/
fashion/
beauty/
electronics/
jewelry/
home/
sports/
single-product/

migrations/
scripts/
tests/
docs/
deploy/

package.json
pnpm-workspace.yaml
tsconfig.json
wrangler.jsonc
README.md
LICENSE

如果实际构建发现某些目录划分不合理，可以优化，但必须保留核心模块、插件、主题和部署工具的边界。

---

# 4. 系统核心架构

CloudCart Core 负责：

- 商品
- 分类
- SKU
- 库存
- 购物车
- 订单
- 客户
- 优惠
- 配送
- 结账
- 支付状态机
- 主题管理
- 插件管理
- 页面配置
- 用户认证
- SEO

核心系统不得直接依赖 Stripe、PayPal 或具体主题。

支付和主题必须通过接口接入。

核心模块不得通过动态 eval 执行插件代码。

所有插件都必须在构建阶段被打包。

后台只负责启用、禁用和配置。

插件升级需要重新构建和部署。

---

# 5. 插件 SDK

设计通用插件接口。

每个插件需要：

plugin.json
index.ts
schema.ts
admin/
storefront/
migrations/
tests/

统一接口示例：

```typescript
export interface CloudCartPlugin {
  manifest: PluginManifest;

  register(context: PluginContext): void;

  onEnable?(): Promise<void>;

  onDisable?(): Promise<void>;
}
```

插件 Manifest：

```typescript
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  apiVersion: string;
  type:
    | "payment"
    | "shipping"
    | "marketing"
    | "seo"
    | "analytics"
    | "product"
    | "theme";

  description: string;
  capabilities: string[];
  permissions: string[];
  dependencies?: string[];
}
```

要求：

- 插件 ID 全局唯一。
- 插件版本采用 Semantic Versioning。
- 插件必须声明 API 兼容版本。
- 插件必须声明所需权限。
- 插件启用状态持久化到 D1。
- 插件设置持久化到 D1。
- 禁用插件时隐藏其前台入口。
- 禁用插件时不能创建新支付。
- 禁用插件不能删除历史订单。
- 对已有支付交易保留必要的 Webhook 处理能力。
- 插件迁移必须可追踪。
- 插件卸载不能默认删除业务数据。
- 插件出现异常时不能导致整个 Worker 崩溃。

建立插件注册中心 Plugin Registry。

建立插件依赖检查器。

建立插件权限检查器。

建立插件版本兼容检查器。

后台插件管理页面必须能够显示：

- 插件名称
- 图标
- 描述
- 版本
- 类型
- 当前状态
- 所需权限
- 配置入口
- 启用/停用按钮

注意：

插件的后台启用状态和插件是否已经构建进 Worker 是两个不同概念。

后台不得假装安装了未构建进当前 Worker 的插件。

---

# 6. 支付 SDK

设计统一支付接口。

```typescript
export interface PaymentPlugin {
  manifest: PluginManifest;

  validateConfig(
    config: unknown
  ): Promise<ValidationResult>;

  createCheckout(
    input: CheckoutInput
  ): Promise<CheckoutResult>;

  verifyWebhook(
    request: Request,
    config: PaymentConfig
  ): Promise<PaymentEvent>;

  getPaymentStatus(
    transactionId: string
  ): Promise<PaymentStatus>;

  refund?(
    input: RefundInput
  ): Promise<RefundResult>;
}
```

第一批必须完成三个支付插件。

## 6.1 Stripe

采用 Stripe Checkout Hosted Page。

官方 API：

https://docs.stripe.com/api/checkout/sessions/create

必须实现：

- Sandbox
- Live
- Secret Key 配置
- Webhook Secret 配置
- 创建 Checkout Session
- 成功跳转
- 取消跳转
- Webhook
- 支付成功处理
- 支付失败处理
- 幂等处理

Webhook 必须使用原始请求 Body 验证 Stripe-Signature。

官方文档：

https://docs.stripe.com/webhooks

不得仅凭成功跳转 URL 将订单标记为已支付。

支付状态必须由服务器验证后的事件决定。

## 6.2 PayPal

使用 PayPal Orders v2。

官方 API：

https://developer.paypal.com/api/orders/v2

必须实现：

- Client ID
- Client Secret
- Sandbox
- Live
- 获取 OAuth Access Token
- 创建 Order
- 前端 PayPal Button
- 服务端 Capture
- Webhook
- Webhook 签名验证
- 支付状态查询
- 幂等处理

不得相信浏览器直接提交的金额。

服务端必须根据内部订单重新核对金额、币种和订单 ID。

## 6.3 Manual Payment

必须实现：

- 银行转账
- 货到付款
- 自定义付款说明
- 收款账号
- 转账备注
- 付款凭证上传（可选）
- 管理员确认收款
- 管理员拒绝收款
- 支付记录
- 操作审计

Manual Payment 不需要第三方 API。

## 6.4 密钥安全

后台支付配置表单不得直接保存明文密钥。

采用：

- Web Crypto API
- AES-GCM
- HKDF
- APP_MASTER_KEY

APP_MASTER_KEY 必须是 Cloudflare Worker Secret。

密钥在 D1 中采用密文存储。

后台只显示：

已配置 / 未配置

允许重新输入密钥。

不得返回完整密钥。

不得将密钥写入 console。

不得在浏览器存储 Secret Key。

---

# 7. 主题 SDK

创建 Theme SDK。

主题 Manifest：

```typescript
export interface ThemeManifest {
  id: string;
  name: string;
  version: string;
  previewImage: string;
  description: string;

  supportedPages: string[];

  supportedBlocks: string[];

  settingsSchema: Record<string, unknown>;
}
```

每个主题必须实现：

- 首页
- 商品列表
- 商品详情
- 分类页面
- 搜索结果
- 购物车
- 结账
- 基础静态内容页

主题不得自己实现商品数据库和支付逻辑。

必须使用 Core 提供的统一数据接口。

第一批实现 8 个主题：

1. Default
2. Fashion
3. Beauty
4. Electronics
5. Jewelry
6. Home
7. Sports
8. Single Product

每套主题必须有明显不同的视觉设计。

不能只是修改颜色。

必须具有不同的：

- 首页结构
- Banner 布局
- 商品卡片
- 字体体系
- 留白比例
- 图片比例
- Header
- Footer
- 商品详情布局

设计质量要求：

参考 Shopify 高质量付费主题的视觉质量，但不复制受版权保护的模板。

页面必须有真实商品布局，不允许大量空白占位。

使用本地原创 SVG 占位素材，不得使用未经授权的商业图片。

主题预览图可以作为静态资源提供。

---

# 8. 可视化页面编辑器

这是核心卖点，必须认真实现。

采用三栏结构。

左侧：

模块列表。

中间：

实时页面预览。

右侧：

模块属性。

底部或顶部：

保存、预览、发布、撤销、重做。

## 8.1 第一批模块

- Hero
- Announcement Bar
- Header
- Image Banner
- Product Grid
- Featured Collection
- Category Grid
- Image with Text
- Rich Text
- Video Embed
- Testimonials
- FAQ
- Trust Badges
- Logo List
- Spacer
- Divider
- Footer

## 8.2 编辑能力

- 添加模块
- 删除模块
- 复制模块
- 拖拽排序
- 隐藏模块
- 修改文本
- 修改图片
- 修改背景
- 修改颜色
- 修改字体
- 修改边距
- 修改对齐
- 修改按钮
- 修改链接
- 修改商品数量
- 修改商品来源
- 修改模块宽度

## 8.3 页面编辑器交互

必须实现：

- 桌面预览
- 平板预览
- 手机预览
- 实时预览
- 自动保存草稿
- 手动保存
- 发布
- 撤销
- 重做
- 发布版本记录

模块排序使用 SortableJS。

页面配置使用 JSON Schema 验证。

不允许直接执行用户输入的 JavaScript。

HTML 内容必须严格消毒。

## 8.4 页面数据结构

示例：

```json
{
  "version": 1,
  "page": "home",
  "sections": [
    {
      "id": "hero-001",
      "type": "hero",
      "enabled": true,
      "settings": {
        "title": "Discover Our Collection",
        "subtitle": "New Season",
        "buttonText": "Shop Now",
        "image": "/media/hero.webp"
      }
    },
    {
      "id": "products-001",
      "type": "product-grid",
      "enabled": true,
      "settings": {
        "title": "Featured Products",
        "limit": 8
      }
    }
  ]
}
```

页面数据存入 D1。

页面发布创建不可变版本。

---

# 9. 商品系统

必须实现：

- 商品 CRUD
- 商品分类
- SKU
- 商品变体
- 商品图片
- 商品价格
- 原价
- 商品描述
- 商品标签
- 库存
- 商品上下架
- SEO Title
- SEO Description
- URL Slug

商品类型：

- Simple Product
- Variable Product

商品变体支持：

- Size
- Color
- Material
- 自定义属性

商品图片使用 R2。

上传必须：

- 验证 MIME Type
- 验证扩展名
- 限制大小
- 使用随机文件名
- 拒绝 SVG 上传作为默认策略
- 不允许任意文件公开执行
- 记录文件元数据
- 删除商品时提供关联图片清理选项

v1 单张图片限制建议 5MB。

不要在 Worker 中执行复杂图片压缩。

---

# 10. 购物车与订单

购物车支持：

- 添加商品
- 删除商品
- 修改数量
- 变体
- 优惠码
- 运费
- 小计
- 总计

购物车可以先保存在浏览器。

服务器创建订单前必须重新验证：

- 商品是否存在
- 商品是否上架
- SKU 是否有效
- 商品价格
- 商品库存
- 优惠码
- 运费
- 最终金额

金额统一使用整数最小货币单位。

不得使用浮点数进行金额计算。

订单必须具备：

- 内部订单 ID
- 订单编号
- 客户信息
- 商品快照
- 价格快照
- 配送地址快照
- 支付方式
- 支付状态
- 订单状态
- 创建时间
- 更新时间

订单商品信息必须保存快照，不能只引用商品当前数据。

订单创建和库存扣减必须保证原子性。

使用 D1 batch 和条件更新，防止库存被重复扣减。

---

# 11. 数据库

使用 SQL migrations。

建立：

- admins
- admin_sessions
- store_settings
- products
- product_variants
- product_images
- categories
- product_categories
- inventory_movements
- customers
- customer_addresses
- orders
- order_items
- order_addresses
- payment_transactions
- payment_events
- shipping_zones
- shipping_rates
- coupons
- coupon_redemptions
- plugins
- plugin_settings
- themes
- theme_settings
- pages
- page_versions
- media
- audit_logs
- installation_state

每个表都要考虑：

- 主键
- 外键
- 索引
- 时间字段
- 状态字段
- 删除策略

所有数据库查询必须使用 Prepared Statements。

严禁 SQL 拼接用户输入。

列表接口必须分页。

禁止 SELECT * 全表扫描用于常规页面。

为商品 slug、SKU、订单编号、创建时间、状态等常用字段建立索引。

---

# 12. 后台 UI

后台风格：

现代、简洁、专业，参考 Shopify Admin。

要求：

- 左侧固定导航栏
- 顶部工具栏
- 面包屑
- 页面标题
- 统计卡片
- 数据表格
- 筛选器
- 搜索框
- 弹窗
- Toast
- 加载状态
- 空状态
- 错误状态

菜单：

Dashboard
Products
Categories
Orders
Customers
Discounts
Themes
Page Builder
Plugins
Payments
Shipping
SEO
Media
Settings

后台必须支持桌面端和移动端。

---

# 13. 安全与认证

v1 单管理员系统。

实现：

- 首次初始化 Token
- 管理员创建
- 安全密码哈希
- HttpOnly Cookie
- Secure Cookie
- SameSite Cookie
- Session 签名
- Session 过期
- CSRF 防护
- 登录限流
- 登录失败延迟
- 权限检查
- 审计日志

使用 Web Crypto。

密码哈希参数必须经过 Workers Free CPU 性能测试。

不能因为追求性能而使用明文密码或快速 SHA-256 直接保存密码。

首次初始化成功后，必须禁用 SETUP_TOKEN 和初始化入口。

APP_MASTER_KEY 不得保存到 D1。

不得将 Cloudflare API Token 存在 Worker 运行环境中。

所有支付密钥必须加密存储。

---

# 14. SEO 与前端性能

必须支持：

- 服务端可读取的商品名称
- 商品描述
- Meta Title
- Meta Description
- Canonical
- Open Graph
- Sitemap
- Robots
- Product Schema
- Breadcrumb Schema

采用轻量服务端 HTML 渲染或其他经过验证的 Cloudflare 兼容方案。

避免大型 SSR 框架。

对公开页面合理缓存。

商品更新时使对应缓存失效。

静态 JS、CSS、图片使用长期缓存和内容哈希。

图片使用懒加载。

首屏图片优先加载。

避免首页一次性请求全部商品。

---

# 15. Cloudflare 部署

必须提供：

- wrangler.jsonc
- D1 migrations
- R2 binding
- Workers Static Assets
- deploy script
- setup script
- secrets setup
- README

设计一条命令完成资源初始化和部署：

```bash
pnpm install
pnpm run deploy:cloudflare
```

脚本需要：

1. 检查 Node.js。
2. 检查 Wrangler。
3. 检查 Cloudflare 登录。
4. 获取 Account ID。
5. 创建 D1 数据库。
6. 创建 R2 Bucket。
7. 写入本地部署配置。
8. 生成 APP_MASTER_KEY。
9. 生成 SETUP_TOKEN。
10. 配置 Worker Secrets。
11. 执行 D1 migrations。
12. 构建前端。
13. 检查 Worker bundle。
14. 检查免费额度相关配置。
15. 部署 Worker。
16. 输出访问地址。
17. 输出一次性管理员初始化链接。

脚本必须支持重复执行。

重复部署时不能重复创建数据库。

不得覆盖已有生产数据。

部署前必须检查当前资源是否已经存在。

如果 Cloudflare 的部署按钮不能自动创建 D1 或 R2，必须使用项目 CLI 完成资源创建，不得伪造一键部署结果。

不得在 Worker 运行时使用 Cloudflare API Token 管理自己的基础设施。

README 必须提供：

- GitHub Deploy 按钮（仅在流程真正可用时添加）
- CLI 部署方式
- 自定义域名绑定
- 更新方法
- 备份方法
- 恢复方法

---

# 16. 资源预算和保护

建立 Resource Guard 模块。

每次重要操作记录：

- D1 rows_read
- D1 rows_written
- D1 storage_size
- R2 storage estimate
- R2 operation estimate
- API operation counters

后台展示：

- D1 数据库使用情况
- 图片存储使用情况
- 本地估算的请求量
- 每日写入量
- 资源警告

注意：

应用层无法直接保证 Cloudflare 所有账户共享额度的精确剩余值。

必须明确区分：

- Cloudflare 官方真实指标
- CloudCart 本地估算指标

接近安全阈值时：

- 停止非必要图片上传。
- 阻止大批量导入。
- 限制非必要的写入任务。
- 显示管理员警告。
- 不自动升级计划。
- 不自动启用付费资源。

为资源使用提供可配置的安全阈值。

---

# 17. 测试要求

不能只做 TypeScript 编译检查。

必须测试：

## Core

- 商品创建
- 商品修改
- 库存扣减
- 订单创建
- 金额计算
- 优惠码
- 订单状态转换

## Plugin

- 插件注册
- 插件启用
- 插件停用
- 插件配置
- 插件依赖
- 插件 API 版本

## Theme

- 主题注册
- 主题切换
- 页面模块加载
- 页面配置验证
- 页面发布

## Payment

- Stripe Session 创建
- Stripe Webhook 验签
- Stripe 重复事件
- PayPal 创建订单
- PayPal Capture
- PayPal Webhook 验签
- Manual Payment
- 重复支付回调
- 订单金额篡改
- 伪造成功页面

## Security

- SQL Injection
- XSS
- CSRF
- Session 过期
- 未授权后台访问
- 非法图片上传
- 密钥泄漏
- 登录暴力尝试

## Deployment

- Wrangler 本地运行
- 本地 D1
- 本地 R2
- 数据库迁移
- Cloudflare Free 部署配置
- 重复部署
- 部署失败恢复

---

# 18. 开发执行规则

你必须真正执行开发，而不是只回复设计方案。

开始时：

1. 检查当前仓库。
2. 检查已有文件。
3. 如果仓库为空，创建项目。
4. 先建立技术架构。
5. 先创建 PRD 和架构文档。
6. 建立 TypeScript 项目。
7. 建立 Cloudflare 本地运行环境。
8. 逐个阶段实现。

开发过程中：

- 每完成一个模块立即运行测试。
- 不要一次性生成所有代码而不验证。
- 不要留下假的按钮。
- 不要使用静态假数据冒充数据库。
- 不要用 setTimeout 模拟支付成功。
- 不要将未实现功能标记为完成。
- 不要跳过错误处理。
- 不要将安全功能留给以后。
- 不要引入未验证的依赖。
- 不要修改 Cloudflare 付费计划来解决问题。

如果遇到技术困难：

先阅读 Cloudflare 官方文档，再寻找符合免费限制的替代实现。

不允许为了快速完成而改变既定架构。

---

# 19. 开发里程碑

按照以下顺序执行。

## Milestone 0 — 基础工程

完成：

- Monorepo
- TypeScript
- Preact
- Vite
- Hono
- Wrangler
- D1
- R2
- 本地开发环境
- CI 基础测试

交付：

可运行的最小 Cloudflare Worker。

## Milestone 1 — 核心商城

完成：

- 数据库迁移
- 管理员认证
- 商品管理
- 分类管理
- 商品图片
- 商品详情
- 商品列表
- 购物车
- 访客结账
- 订单管理
- Manual Payment

交付：

可以真实创建和管理商品及订单的商城。

## Milestone 2 — 主题系统

完成：

- Theme SDK
- Theme Registry
- 8 套主题
- 主题预览
- 主题切换
- 全局设计配置

交付：

后台能够切换不同主题。

## Milestone 3 — 页面编辑器

完成：

- 拖拽编辑
- 模块列表
- 属性编辑
- 手机预览
- 平板预览
- 桌面预览
- 草稿
- 发布
- 撤销
- 重做

交付：

能够通过后台编辑首页，不修改代码。

## Milestone 4 — 插件系统

完成：

- Plugin SDK
- Plugin Registry
- 插件状态
- 插件设置
- 权限管理
- 依赖检查
- 插件管理 UI

交付：

新增插件不需要修改核心业务代码。

## Milestone 5 — Stripe / PayPal

完成：

- Stripe Sandbox
- Stripe Live 配置
- PayPal Sandbox
- PayPal Live 配置
- Webhook
- 幂等
- 订单状态机
- 退款基础接口

交付：

可完成真实支付渠道的 Sandbox 测试。

## Milestone 6 — 部署与优化

完成：

- 一键部署入口
- CLI 自动部署
- 资源自动创建
- 密钥生成
- 数据库初始化
- 资源使用警告
- SEO
- 性能优化
- 安全测试
- README

交付：

可以由新用户部署自己的独立商城。

---

# 20. 最终验收

必须满足：

- 本地运行成功。
- Cloudflare Workers Free 部署成功。
- 不依赖付费服务器。
- 不依赖付费 SaaS。
- 管理员可以登录。
- 商品可以管理。
- 图片可以上传。
- 购物车可以运行。
- 订单可以创建。
- 人工支付可以使用。
- Stripe Sandbox 可以使用。
- PayPal Sandbox 可以使用。
- 支付事件可以安全验证。
- 8 套主题可以切换。
- 页面可以拖拽编辑。
- 页面配置可以保存。
- 插件可以启用和禁用。
- 插件状态可以持久化。
- SEO 页面可被读取。
- 部署脚本可重复执行。
- 测试通过。
- 不存在虚假的已完成状态。

最后生成：

1. README.md
2. docs/PRD.md
3. docs/ARCHITECTURE.md
4. docs/PLUGIN_DEVELOPMENT.md
5. docs/THEME_DEVELOPMENT.md
6. docs/PAYMENT_INTEGRATION.md
7. docs/DEPLOYMENT.md
8. docs/SECURITY.md
9. docs/FREE_TIER_BUDGET.md
10. docs/TEST_REPORT.md

开始执行。

第一步先检查仓库并建立 Milestone 0，不要只给我回复一个开发计划。

完成一个里程碑后，报告实际修改的文件、运行的测试、测试结果、未完成内容和下一步工作。

绝不声称没有实际运行过的测试已经通过。
