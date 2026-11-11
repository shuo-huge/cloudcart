---
title: 测试与验证
description: 本地和 CI 的测试命令、覆盖范围和已知缺口。
---

## 命令

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

## Vitest

使用 `@cloudflare/vitest-plugin` 在 workerd 中运行，连接真实 D1。

当前覆盖：

- 健康检查和安装状态
- 金额、slug、HTML 消毒
- 商品、购物车、结账、库存、人工付款、发货
- 页面编辑、发布、版本回滚
- Stripe / PayPal webhook 签名和幂等
- 税费规则和订单税费
- 邮件发件箱和重试
- 商品图片排序
- 远程插件 Manifest、JWT、生命周期、HMAC、插件 API、远程支付

## Playwright

`pnpm test:e2e` 会：

1. 构建前台和后台
2. 使用独立的 `.wrangler/e2e` D1
3. 启动本地 mock 远程插件
4. 启动 `wrangler dev`
5. 通过一次性 Setup token 创建管理员
6. 运行浏览器测试

覆盖：

- 管理员登录
- 页面编辑器拖拽、预览、发布
- 桌面/平板/手机响应式
- 商品图片拖拽和前台封面
- 邮件插件后台
- 主题预览弹窗
- 远程插件安装 → 菜单 → iframe JWT → 禁用 → 卸载
- 游客含税下单

## 已知未测试

- PayPal Sandbox 交易（Stripe Sandbox 已验证）
- 真实邮件服务商投递
- 公网 HTTPS 第三方远程插件
- R2 上传集成
- 并发下单压力测试
- Cloudflare 配额行为

## CI

GitHub Actions 运行：

- `validate`：typecheck、Vitest、build
- `e2e`：安装 Chromium，运行 Playwright

## 修改后建议

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

如果修改了 Worker 或后台 UI，至少跑一遍 Playwright 的相关 spec。
