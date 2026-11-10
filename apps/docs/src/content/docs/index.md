---
title: CloudCart
description: 免费、开源、插件化的电商系统，原生运行在 Cloudflare Workers 上。
template: splash
hero:
  tagline: 一个 Worker、一套 D1 数据库，就能拥有自己的在线商店。开源、免费、数据归你。
  actions:
    - text: 快速开始
      link: /getting-started/introduction/
      icon: right-arrow
      variant: primary
    - text: 一键部署
      link: /getting-started/one-click-deploy/
      icon: rocket
      variant: secondary
---

## 为什么选择 CloudCart

CloudCart 把商品、订单、购物车、结账、主题、页面编辑器和插件都放进一个 Cloudflare Worker，数据存放在你自己的 D1 数据库里。

- **没有平台月费**：运行在 Cloudflare Workers Free 免费额度内。
- **数据归你**：每个商店拥有独立的 Worker 和 D1，不与其他商家共享租户。
- **开箱即用**：8 套主题、可视化页面编辑器、SEO、优惠券、运费、税费、邮件通知。
- **真正可扩展**：内置支付/邮件插件，也支持无需重新部署的远程插件。
- **对搜索引擎友好**：商品和内容页服务端渲染，Meta、JSON-LD、sitemap 全部内置。

## 从这里开始

| 我想… | 去看 |
|---|---|
| 先了解 CloudCart 是什么 | [项目介绍](/getting-started/introduction/) |
| 在本地跑起来 | [本地开发](/getting-started/local-development/) |
| 直接部署到 Cloudflare | [一键部署](/getting-started/one-click-deploy/) |
| 安装远程插件 | [安装远程插件](/plugins/remote-install/) |
| 开发自己的主题或插件 | [开发者文档](/developers/architecture/) |

## 当前状态

CloudCart 目前是 v0.5.0：核心商城、8 套主题、税费、邮件通知、页面版本回滚、图片排序、R2/jsDelivr 本地上传与存储切换、内置/远程混合插件、面向智能体的管理 CLI 和浏览器端到端测试均已完成。尚未验证的能力会在对应文档中明确标注。
