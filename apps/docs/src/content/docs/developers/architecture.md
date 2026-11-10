---
title: 架构概览
description: CloudCart 的运行时拓扑、代码结构和请求流程。
---

## 拓扑

```text
浏览器
  └─ Cloudflare 边缘
       ├─ Workers Static Assets     /static/*、/static/admin-ui/*
       └─ Worker (Hono)             /、/api/*、/api/plugin/v1/*、/admin、/media/*、/webhooks/*
            ├─ D1 (SQLite)          商品、订单、页面、设置、会话……
            ├─ 可选 R2              直接上传图片
            └─ 远程插件             独立 HTTPS 服务 + iframe 后台
```

一个商店 = 一个 Worker + 一个 D1。没有多租户共享数据库。

## 代码结构

| 路径 | 作用 |
|---|---|
| `apps/worker` | Hono API、SSR、Webhook、媒体、后台壳 |
| `apps/admin` | Preact 后台 SPA 和页面编辑器 |
| `apps/storefront` | 小型前台脚本（购物车、订阅） |
| `apps/docs` | 本使用文档站（Astro Starlight） |
| `packages/core` | 商品、订单、支付、税费、页面、主题、插件等业务逻辑 |
| `packages/database` | D1 封装、行类型、资源保护 |
| `packages/security` | 密码、会话、加密、JWT、CSP、消毒 |
| `packages/plugin-sdk` | 插件/支付/远程插件类型 |
| `packages/theme-sdk` | 主题接口、HTML 工具、主题 kit |
| `plugins/*` | 内置插件 |
| `themes/*` | 8 套主题 |
| `migrations/` | D1 迁移 |

## 请求流程

### 商店前台

1. Worker 创建 `Storefront` 服务
2. 通过 D1 查询读取数据
3. 主题返回 HTML 字符串
4. `renderDocument` 加上 SEO、JSON-LD、设计变量和静态资源路径

所有公开页面服务端渲染，不依赖前端框架。

### 结账

1. 从 D1 重新加载购物车
2. 校验商品、库存、优惠券、运费
3. 计算税费
4. 预占优惠券和库存
5. 原子写入订单、明细、地址、库存流水
6. 清空购物车
7. 人工支付 → 待付款；在线支付 → 创建支付会话

### 支付事件

```text
服务商 → /webhooks/:plugin
  1. 验证签名
  2. 归一化为 PaymentEvent
  3. 按 eventId 幂等
  4. 校验金额和币种
  5. 标记交易成功 + 订单已支付
```

重复事件、金额不匹配都不会把订单标记为已支付。

### 远程插件

```text
后台 iframe → postMessage(ready)
  → /api/admin/plugins/:id/launch
  → 短期 JWT
  → iframe 调用 /api/plugin/v1/*
```

CloudCart → 插件服务使用 HMAC 签名；插件 → CloudCart 使用 Bearer JWT。

## 数据模型

主要表：

`products`、`product_variants`、`product_images`、`categories`、`carts`、`cart_items`、`orders`、`order_items`、`order_addresses`、`payment_transactions`、`payment_events`、`shipping_zones`、`shipping_rates`、`tax_rates`、`plugins`、`plugin_settings`、`pages`、`page_versions`、`themes`、`email_outbox`、`store_identity`、`audit_logs`。

金额全部使用整数最小货币单位（如分）。

## 安全

- PBKDF2 密码
- HMAC 会话 cookie
- CSRF 双提交
- 登录限流
- 全部 SQL 预编译
- HTML 白名单
- CSP、`frame-ancestors 'none'`、`X-Frame-Options: DENY`
- 插件 JWT/HMAC/CORS 隔离

详细设计见仓库的 `docs/ARCHITECTURE.md` 和 `docs/SECURITY.md`。
