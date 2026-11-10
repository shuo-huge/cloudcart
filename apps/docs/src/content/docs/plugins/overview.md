---
title: 插件概览
description: 内置插件与远程插件的区别、安全边界和适用场景。
---

CloudCart 支持两种插件：

| | 内置插件（Bundled） | 远程插件（Remote） |
|---|---|---|
| 代码位置 | 随 Worker 构建打包 | 插件作者自己的 HTTPS 服务 |
| 安装方式 | 随 CloudCart 版本发布 | 后台输入 Manifest URL |
| 是否需要重新部署 | 升级代码需要 | 不需要 |
| 后台页面 | 内置在 CloudCart 后台 | 通过 iframe 嵌入 |
| 数据访问 | Worker 内部服务 | 权限受限的 `/api/plugin/v1/*` |
| 即时生效 | 启用即生效 | 安装并启用后生效 |

## 内置插件

当前内置：

- **Manual Payment**：银行转账、货到付款、自定义说明
- **Stripe Checkout**
- **PayPal Orders v2**
- **Admin Language Pack**：English / 简体中文
- **Email Notifications**：Resend 或 Cloudflare Email Workers

内置插件在 **后台 → Plugins** 中启用/禁用，配置入口在对应页面（Payments、Emails、语言设置）。

## 远程插件

远程插件适合：

- 独立部署的分析、营销、客服、ERP 集成
- 插件作者希望独立升级、独立发布
- 需要自己的数据库和后台页面

安全边界：

- 插件代码**永远不会**下载到 CloudCart Worker 执行
- 安装时管理员确认 Manifest 和权限
- 服务端通信使用 HMAC-SHA256 签名
- 后台 iframe 使用短期 JWT，只能访问授权 API
- 禁用插件后，下一次请求立即失效

详见 [安装远程插件](/plugins/remote-install/) 和 [开发远程插件](/plugins/remote-development/)。

## 当前不包含

- 公共插件市场
- 发布者签名、评分、付费
- 自动更新
- 远程主题、远程店铺前端
