# CloudCart — 产品需求文档（PRD）

**版本：** 1.0  
**产品定位：** Cloudflare 原生、免费额度优先、插件化独立电商系统  
**开发语言：** TypeScript  
**目标运行环境：** Cloudflare Workers Free  
**部署模式：** 每次部署一个独立商城  
**项目协议：** MIT（项目自有代码）

---

## 1. 产品目标

CloudCart 是一套轻量、模块化、可扩展的开源电商系统。

用户通过一键部署或一条安装命令，将完整商城部署到自己的 Cloudflare 账户。

每个部署实例拥有独立的：

- 商城域名
- 商品和商品分类
- 订单及客户数据
- 后台管理员
- 主题和页面配置
- 插件启用状态
- 支付渠道配置
- 商品图片和媒体文件

CloudCart 不提供集中式 SaaS 服务，不要求用户购买 CloudCart 订阅，不要求租赁 VPS。

### 核心目标

1. 免费部署到 Cloudflare Workers Free。
2. 提供至少 8 套内置商城主题。
3. 支持可视化拖拽式页面编辑器。
4. 支持自定义主题。
5. 支持插件式功能扩展。
6. 支持 Stripe、PayPal、人工支付插件。
7. 商品、订单、购物车、库存管理完整。
8. 支持 SEO 和独立域名。
9. 适合未来部署 10 个或更多独立商城，但必须遵守 Cloudflare 免费账户资源上限。

## 2. 技术架构

### 2.1 技术选型

| 层级 | 技术 | 作用 |
|---|---|---|
| 前端 | Preact + TypeScript | 商城和后台 |
| 构建 | Vite | 代码构建 |
| 后端 | Hono + TypeScript | API 路由 |
| 运行时 | Cloudflare Workers | 服务端逻辑 |
| 数据库 | Cloudflare D1 | SQLite 数据库 |
| 图片 | 外链 HTTPS 或可选 Cloudflare R2 | 默认使用外链；启用 R2 后才支持直接上传 |
| 静态资源 | Workers Static Assets | 前端文件 |
| 数据访问 | 原生 D1 Prepared Statements | 轻量数据库操作 |
| 拖拽 | SortableJS | 页面编辑器 |
| 表单验证 | Zod 或轻量等价方案 | 输入验证 |
| 测试 | Vitest + Miniflare | 单元和集成测试 |

要求：

- 使用 TypeScript。
- 使用 ES Modules。
- 不使用 Node.js 原生服务器。
- 不使用 Express。
- 不使用 MySQL、PostgreSQL。
- 不使用 Redis。
- 不使用 Docker 作为生产部署前提。
- 不使用付费 ORM 或数据库托管。
- 不使用需要常驻进程的功能。
- 优先使用 Cloudflare 原生 Web APIs。

### 2.2 运行架构

单个商城包含：

1 个 Worker  
1 个 D1 数据库  
1 个可选 R2 Bucket（默认不创建）  
1 套静态前端资源

Worker 同时处理：

- `/api/*`
- `/admin/*` 的服务端数据接口
- `/webhooks/*`
- 必要的 SEO 服务端渲染页面

静态资源通过 Workers Static Assets 提供。

静态文件必须尽量在 Worker 代码执行前直接返回。

### 2.3 数据隔离

每个部署实例使用独立资源。

示例：

- cloudcart-fashion Worker
- cloudcart-fashion D1
- cloudcart-fashion R2

另一个网站：

- cloudcart-beauty Worker
- cloudcart-beauty D1
- cloudcart-beauty R2

禁止在默认部署模式下把不同商店的数据放进同一个数据库。

## 3. 商城前台

### 3.1 首页

支持以下模块：

- Announcement Bar
- Header
- Logo
- 导航菜单
- Hero Banner
- 商品分类
- Featured Products
- New Arrivals
- Best Sellers
- Image with Text
- 品牌故事
- 商品评价
- FAQ
- Newsletter 展示模块（无外部邮件服务时仅展示或收集至 D1）
- Footer

首页模块支持拖拽排序、隐藏、显示、复制和删除。

### 3.2 商品列表

功能：

- 商品图片
- 商品名称
- 商品价格
- 原价
- 折扣展示
- 商品分类
- 商品筛选
- 商品排序
- 分页
- 搜索
- 商品标签

### 3.3 商品详情

功能：

- 商品主图
- 商品图片画廊
- 商品名称
- 商品描述
- 价格
- 原价
- SKU
- 商品变体
- 库存状态
- 数量选择
- 加入购物车
- 商品推荐
- SEO Meta 信息

### 3.4 购物车

支持：

- 添加商品
- 删除商品
- 修改数量
- 选择商品变体
- 计算商品总价
- 优惠码
- 计算运费
- 跳转结账

购物车中的价格不得作为最终支付价格。

服务器必须重新查询商品价格、库存和优惠规则。

### 3.5 结账

支持访客结账。

收集：

- 客户姓名
- 邮箱
- 电话
- 收货地址
- 国家
- 州或省
- 城市
- 邮政编码
- 配送方式
- 付款方式

v1 不强制要求客户注册账号。

## 4. 后台管理

### 4.1 Dashboard

展示：

- 总订单数
- 待处理订单
- 已支付订单
- 销售总额
- 最近订单
- 热销商品

数据来自当前 D1 数据库。

### 4.2 商品管理

支持：

- 创建商品
- 编辑商品
- 删除商品
- 商品上下架
- 商品图片上传
- 商品分类
- SKU
- 商品变体
- 库存
- 商品价格
- 原价
- 商品描述
- SEO 标题
- SEO 描述
- 商品 URL Slug

### 4.3 订单管理

订单状态：

- draft
- pending_payment
- awaiting_manual_payment
- paid
- processing
- shipped
- completed
- cancelled
- refunded
- partially_refunded

支持：

- 订单详情
- 客户资料
- 商品明细
- 配送信息
- 支付信息
- 修改订单状态
- 添加内部备注
- 记录操作日志

管理员不得直接将第三方支付未验证的订单标记为已付款，人工确认必须记录操作者和时间。

### 4.4 客户管理

支持：

- 客户列表
- 客户邮箱
- 客户电话
- 订单历史
- 累计消费
- 客户备注

v1 不做复杂会员等级系统。

### 4.5 配送管理

支持：

- 配送区域
- 固定运费
- 免费配送门槛
- 按国家或地区配置配送方式
- 订单物流单号
- 手动填写物流信息

不依赖第三方物流 SaaS。

### 4.6 优惠管理

支持：

- 固定金额优惠
- 百分比优惠
- 最低消费金额
- 有效期
- 使用次数
- 商品或分类适用范围

## 5. 插件系统

插件采用混合架构：内置插件构建时打包、运行时启停；远程插件运行在插件作者独立部署的 HTTPS 服务上，CloudCart 只保存 Manifest 并通过 HMAC 签名 API 通信，后台通过 iframe 嵌入。

禁止运行时下载、`eval` 或执行任意插件 JavaScript。远程插件必须使用 HTTPS，安装需要管理员确认；插件代码永远不进入 CloudCart Worker。

### 5.1 插件类型

- Payment Plugin
- Shipping Plugin
- Marketing Plugin
- SEO Plugin
- Analytics Plugin
- Product Plugin
- Customer Plugin
- Theme Plugin

### 5.2 插件标准

每个插件包含：

- plugin.json
- index.ts
- schema.ts
- migrations（可选）
- admin UI（可选）
- storefront UI（可选）
- tests

插件必须声明：

- id
- name
- version
- type
- apiVersion
- description
- permissions
- dependencies
- capabilities

### 5.3 插件生命周期

- 插件随构建包发布。
- 后台可以启用和停用插件。
- 插件配置保存在 D1。
- 插件启用状态保存在 D1。
- 插件卸载不得自动删除业务数据。
- 插件更新必须经过版本兼容检查。
- 插件执行前检查启用状态。
- 插件路由必须由核心路由注册表显式挂载。
- 插件不得访问未声明的核心资源。

插件增加代码或升级版本时需要重新构建和部署。

普通启停和配置不需要重新部署。

## 6. 支付系统

第一批支付插件：

1. Stripe
2. PayPal
3. Manual Payment

### 6.1 Stripe

使用 Stripe Checkout Hosted Page。

流程：

1. 服务器重新验证购物车。
2. 创建内部订单。
3. 服务器请求 Stripe 创建 Checkout Session。
4. 返回 Checkout URL。
5. 客户在 Stripe 页面完成支付。
6. Stripe 发送 Webhook。
7. 服务器验证 Stripe-Signature。
8. 验证成功后更新支付状态。
9. 使用事件 ID 防止重复处理。

必须处理：

- checkout.session.completed
- checkout.session.async_payment_succeeded
- checkout.session.async_payment_failed
- payment_intent.payment_failed

不能根据浏览器跳转成功页面直接确认付款。

### 6.2 PayPal

使用 PayPal Orders v2 API。

流程：

1. 获取 OAuth Access Token。
2. 服务器创建 PayPal Order。
3. 前端展示 PayPal 按钮。
4. 客户批准付款。
5. 服务器执行 Capture。
6. 验证 Capture 金额、币种和内部订单 ID。
7. 验证 PayPal Webhook。
8. 更新内部订单状态。
9. 通过唯一事件 ID 防止重复处理。

支持 Sandbox 和 Live 两种模式。

### 6.3 Manual Payment

支持：

- 银行转账
- 货到付款
- 自定义付款说明
- 转账备注
- 上传付款凭证（可选）
- 管理员人工确认收款

人工支付默认状态为 awaiting_manual_payment。

只有管理员明确确认后，才更新为 paid。

### 6.4 支付插件配置

所有支付密钥必须加密存储。

使用：

- Web Crypto API
- AES-GCM
- HKDF 派生密钥
- Worker Secret APP_MASTER_KEY

支付密钥不得：

- 明文写入 D1
- 出现在浏览器
- 出现在日志
- 返回给后台前端
- 写入 GitHub 仓库

管理员只能重新输入和替换密钥，不能读取已保存的完整密钥。

### 6.5 支付安全

必须：

- 服务端计算价格
- 服务端计算运费
- 服务端验证订单金额
- 服务端验证币种
- 验证 Webhook 签名
- 实现幂等处理
- 实现订单状态机
- 防止重复 Capture
- 防止伪造支付成功
- 防止修改订单金额
- 记录支付事件
- 记录退款事件

## 7. 主题系统

第一批内置主题：

1. Default
2. Fashion
3. Beauty
4. Electronics
5. Jewelry
6. Home
7. Sports
8. Single Product

主题通过 Theme SDK 集成。

每个主题包含：

- theme.json
- design-tokens
- layout
- header
- footer
- product-card
- product-detail
- collection-page
- page-renderers
- supported-blocks
- preview-image

主题可以使用自己的 CSS 和组件。

主题必须使用核心系统提供的统一商品、购物车、搜索和结账接口。

### 7.1 主题管理

后台支持：

- 查看已安装主题
- 主题预览
- 激活主题
- 修改颜色
- 修改字体
- 修改 Logo
- 修改按钮样式
- 修改页面宽度
- 修改商品卡片样式
- 配置 Header
- 配置 Footer

切换主题不得修改商品和订单数据。

### 7.2 自定义主题

开发者可以通过 Theme SDK 创建新主题。

自定义主题代码在构建阶段打包。

不允许后台直接执行未经审核的主题 JavaScript。

## 8. 可视化页面编辑器

采用左侧模块列表、中间实时预览、右侧属性设置的三栏设计。

支持桌面、平板、手机预览。

### 8.1 模块列表

第一批模块：

- Hero
- Announcement Bar
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
- Custom HTML（严格消毒，默认关闭脚本执行）

### 8.2 编辑能力

- 拖拽排序
- 新增模块
- 删除模块
- 复制模块
- 隐藏模块
- 修改文本
- 修改图片
- 修改背景
- 修改颜色
- 修改字体
- 修改间距
- 修改对齐
- 修改宽度
- 修改按钮
- 修改链接
- 撤销
- 重做
- 自动保存草稿
- 发布页面
- 预览页面

### 8.3 数据格式

页面配置以 JSON 保存到 D1。

不得保存可直接执行的任意 JavaScript。

所有页面 JSON 必须经过服务端 Schema 验证。

发布时创建不可变版本快照。

## 9. 数据库设计

至少包含以下表：

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
- carts（如需要持久化）
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

要求：

- 所有金额以整数最小货币单位存储。
- 货币使用 ISO 4217。
- 所有表具备必要的索引。
- 使用外键。
- 重要写入使用 D1 batch 事务。
- 不使用 N+1 查询。
- 列表接口必须分页。
- 订单、支付事件必须支持幂等。
- 商品图片只存外链 URL 或可选 R2 Key 及元数据。

## 10. 身份认证与安全

v1 采用单店主管理员模式。

要求：

- 首次部署使用一次性 SETUP_TOKEN。
- 初始化完成后永久关闭初始化入口。
- 管理员密码使用安全的 PBKDF2/Web Crypto 方案。
- Session 使用 HttpOnly、Secure、SameSite Cookie。
- Session 签名使用 APP_MASTER_KEY 派生密钥。
- 登录接口限制尝试频率。
- 管理后台使用 CSRF 防护。
- 所有后台 API 校验权限。
- 所有输入进行服务端验证。
- 防止 SQL Injection。
- 防止 XSS。
- 防止开放重定向。
- 防止文件上传伪造。
- 管理操作写入审计日志。
- 密钥不能写入日志。

不使用 Clerk、Auth0、Firebase Auth 等第三方付费认证平台。

## 11. SEO

支持：

- 页面 Title
- Meta Description
- Canonical URL
- Open Graph
- Twitter Card
- Product Schema
- Breadcrumb Schema
- Sitemap.xml
- Robots.txt
- 商品 URL Slug
- 301 Redirect 管理

商品和分类页面必须提供可被搜索引擎读取的服务端 HTML 内容。

不允许只依赖客户端 JavaScript 才能呈现商品名称和描述。

## 12. Cloudflare 免费额度约束

目标平台：

- Workers Free
- D1 Free
- R2 免费额度
- Workers Static Assets

严格约束：

- Worker 每次请求 CPU 不超过 10ms。
- Worker 内存不超过 128MB。
- 每次 Worker 调用的 Subrequest 不超过 50。
- D1 每次 Worker 调用最多 50 个查询。
- D1 单库不超过 500MB。
- D1 账户总存储不超过 5GB。
- 每账户最多 10 个 D1 数据库。
- Workers 每日请求不超过 100,000。
- R2 总存储不超过 10GB-month。
- R2 Class A 每月不超过 1,000,000。
- R2 Class B 每月不超过 10,000,000。

必须有用量统计和容量警告。

超过免费额度时，不得自动开启付费套餐。

## 13. 部署系统

目标部署体验：

1. 点击 Deploy to Cloudflare 或运行官方安装命令。
2. 授权 Cloudflare。
3. 选择账户。
4. 输入商城名称。
5. 自动创建 D1。
6. 可选创建 R2（默认跳过）。
7. 自动生成 APP_MASTER_KEY。
8. 自动生成 SETUP_TOKEN。
9. 执行数据库迁移。
10. 构建静态资源。
11. 部署 Worker。
12. 输出商城地址和一次性初始化链接。

部署工具不得要求用户手动编写数据库 ID。

如果 Cloudflare 官方按钮不能完成资源创建，使用随项目提供的安装 CLI 自动创建资源，不得假装按钮已完成未执行的操作。

不得在运行中的 Worker 保存 Cloudflare Account API Token。

## 14. 免费服务原则

不依赖：

- VPS
- 付费数据库
- 付费 CDN
- 付费对象存储
- 付费邮件 SaaS
- 付费认证 SaaS
- 付费搜索 SaaS
- 付费后台服务
- 付费 AI 服务

支付服务商交易手续费、域名注册费用及 Cloudflare 超额费用不属于免费保证范围。

v1 不包含自动邮件发送。订单通知先通过后台订单列表提供，邮件发送以后作为可选插件。

## 15. 第一阶段 MVP 验收标准

必须实际完成：

1. 能够在本地运行。
2. 能够使用 Wrangler 本地 D1 模拟生产环境；启用 R2 时也可本地模拟。
3. 能够一键或一条安装命令部署到 Workers Free。
4. 首次初始化可以创建管理员。
5. 管理员可以登录。
6. 可以创建商品。
7. 可以上传商品图片。
8. 可以创建分类。
9. 可以在前台看到商品。
10. 可以加入购物车。
11. 可以提交访客订单。
12. 可以使用 Manual Payment。
13. 可以管理订单。
14. 可以启用和停用插件。
15. 可以切换至少 8 套内置主题。
16. 可以使用拖拽编辑器修改首页。
17. 页面修改可以保存和发布。
18. SEO 页面可以被读取。
19. Stripe Sandbox 可以完成测试付款。
20. PayPal Sandbox 可以完成测试付款。
21. Webhook 重复投递不会重复更新订单。
22. 所有支付凭证均加密保存。
23. 运行时不依赖付费第三方服务。
24. 具备自动化测试和部署检查。

## 16. 开发阶段

P0：基础架构和 Cloudflare 部署  
P1：商品、分类、库存、订单  
P2：8 套主题和主题 SDK  
P3：可视化拖拽页面编辑器  
P4：插件系统  
P5：Stripe、PayPal、Manual 支付插件  
P6：SEO、安全、性能和部署优化

P1 之前必须建立插件 API 和数据模型，避免后续重构。

P2 和 P3 必须能够独立测试。

P4 以后新增插件不得修改核心订单状态机。

## 17. 产品完成定义

CloudCart v1.0 不是一个 UI Demo。

必须是可以真实部署、真实管理商品、真实创建订单、通过 Stripe 和 PayPal Sandbox 测试付款、支持人工支付、支持多主题切换、支持页面编辑、能够在 Cloudflare 免费额度内运行的完整商城。

任何没有真正实现的功能都必须明确标记为未完成，不得使用静态假数据冒充真实功能。
