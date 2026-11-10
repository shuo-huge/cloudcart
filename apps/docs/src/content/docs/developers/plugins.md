---
title: 插件开发
description: 内置插件的目录结构、注册、设置和生命周期。
---

## 目录结构

```text
plugins/payments/example/
  plugin.json       # 文档/元数据副本
  package.json
  src/index.ts      # 运行时 manifest + 实现
```

## Manifest

```ts
export const manifest = {
  id: "example",
  name: "Example",
  version: "1.0.0",
  apiVersion: "1",
  type: "payment",
  description: "…",
  capabilities: ["payment.checkout"],
  permissions: ["orders:read"],
  dependencies: [],
};
```

要求：

- 唯一 kebab-case id
- SemVer
- `apiVersion` 与 `PLUGIN_API_VERSION` 一致
- 声明能力和权限
- 不下载运行时代码

## 注册

1. 把包加入 `apps/worker/package.json`
2. 在 `apps/worker/src/plugin-registry.ts` 导入
3. 把 manifest 加入 `PluginRegistry`
4. 如果是支付插件，再加入 `paymentPlugins` Map
5. 重新构建和部署

未打包进当前 Worker 的插件不能被启用。

## 设置与密钥

```http
PUT /api/admin/plugins/:id/settings
```

```json
{
  "settings": { "publicKey": "…", "secretKey": "…" },
  "secretKeys": ["secretKey"]
}
```

- `secretKeys` 使用 AES-GCM 加密
- GET 返回 `••••••••`
- 空值或掩码值会保留旧密钥
- 运行时用 `loadPluginRuntimeConfig` 解密

## 生命周期

当前内置插件通过显式调用点接入：

- payment：checkout / webhook / refund
- admin-i18n：`GET /api/i18n`
- email：订单事件 → 发件箱

`onEnable` / `onDisable` 目前不会自动执行。启用/禁用主要是 D1 状态切换。

## 权限

插件应只声明真正需要的权限。核心不会把原始 D1 或 `APP_MASTER_KEY` 交给插件。

## 安全

- 验证 webhook 原始请求体的签名
- 返回稳定 event id
- 不要相信客户端金额
- 不要自行把订单标记为已支付
- 不要记录密钥或完整 PII 请求

## 测试

```bash
pnpm typecheck
pnpm test
```

外部 HTTP 调用可以在测试里替换 `globalThis.fetch`。
