---
title: 项目介绍
description: CloudCart 的定位、功能范围和运行模型。
---

CloudCart 是一个免费、开源、插件化的电商系统，原生运行在 Cloudflare Workers 上。它适合想低成本运营独立商店、又不想维护服务器和数据库的商家与开发者。

## 运行模型

```text
浏览器
  └─ Cloudflare 边缘
       ├─ Workers Static Assets     /static/*、/static/admin-ui/*
       └─ Worker (Hono)             /、/api/*、/admin、/media/*、/webhooks/*
            ├─ D1 (SQLite)          商品、订单、页面、设置、会话……
            ├─ 可选 R2              直接上传图片；默认使用 HTTPS 图片外链
            └─ 远程插件             插件作者服务器上的签名 HTTPS API + iframe 后台
```

每个商店是一个独立的 Worker + D1，不和其他商家共享数据库。插件代码可以随 Worker 构建内置，也可以作为远程插件独立部署。

## 已实现的功能

- **商店前台**：首页、分类、搜索、商品详情、购物车、结算、订单确认、内容页
- **后台**：商品与规格、分类、图片、订单、客户、优惠券、运费、税率、主题、页面编辑器、插件、邮件、设置、SEO、审计
- **交易核心**：服务端价格/库存/优惠/运费/税费重算、库存预占、订单状态机、人工付款确认、物流跟踪
- **支付**：Manual、Stripe Checkout、PayPal Orders v2，以及远程支付插件
- **主题**：8 套内置主题 + Theme SDK
- **页面编辑器**：拖拽排序、实时预览、自动保存、发布、版本回滚
- **插件**：内置插件 + 运行时安装的远程插件
- **SEO**：服务端渲染、Meta、Open Graph、JSON-LD、sitemap、robots、301 重定向

## 当前版本与边界

当前版本是 **v0.5.0**。核心功能可用，但尚未宣称 1.0。

尚未完成或未验证：

- PayPal Sandbox 交易（Stripe Sandbox 已完成真实支付验证；自动化测试使用 mock）
- 真实邮件服务商投递
- 公共插件市场、发布者签名、付费与自动更新
- 远程主题、远程店铺前端
- 免税客户证明、按商品配置税类

这些边界会在各自文档中明确标注，避免把未完成能力当成已完成。

## 技术栈

Hono、Preact、TypeScript、D1、Cloudflare Workers Static Assets。没有需要常驻的服务器，也没有必须付费的 Cloudflare 服务。
