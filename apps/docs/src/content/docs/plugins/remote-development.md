---
title: 开发远程插件
description: Manifest、HMAC 签名、iframe 握手、JWT 和插件 API。
---

远程插件是独立部署的 HTTPS 服务。完整可运行示例在仓库：

```text
examples/remote-plugin/
```

## Manifest

```json
{
  "id": "example-analytics",
  "name": "Example Analytics",
  "version": "1.0.0",
  "apiVersion": "1",
  "type": "analytics",
  "runtime": "remote",
  "description": "Analytics integration",
  "author": "Example Developer",
  "capabilities": ["analytics.read"],
  "permissions": ["store:read", "products:read"],
  "service": {
    "baseUrl": "https://plugin.example.com/api/cloudcart/v1",
    "auth": "hmac-sha256"
  },
  "admin": {
    "entryUrl": "https://plugin.example.com/admin",
    "pages": [
      { "id": "overview", "label": "Analytics overview", "icon": "chart" }
    ]
  }
}
```

要求：

- `runtime` 必须是 `remote`
- URL 必须是公网 HTTPS、端口 443、无用户名密码
- 权限只能使用允许列表
- 后台页面最多 10 个
- Manifest 最大 64 KiB

## 服务密钥

安装时 CloudCart 会生成或接收一个服务密钥。插件服务器需要保存同一个密钥，用于验证 CloudCart 的 HMAC 请求。

## HMAC 请求

CloudCart 调用插件服务时会带：

```text
x-cloudcart-plugin: <plugin id>
x-cloudcart-store-id: <store id>
x-cloudcart-timestamp: <ISO timestamp>
x-cloudcart-nonce: <random>
x-cloudcart-signature: <base64url HMAC-SHA256>
```

签名原文：

```text
timestamp
nonce
METHOD
/path?query
sha256_hex(body)
```

签名：

```js
const expected = crypto
  .createHmac("sha256", serviceSecret)
  .update(canonical)
  .digest("base64url");
```

建议：

- 验证时间戳在 5 分钟内
- 拒绝重复 nonce
- 使用常量时间比较
- 不要记录密钥

## 后台 iframe

CloudCart 使用 sandbox iframe 打开：

```html
<iframe sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
```

插件后台响应必须允许商城 origin：

```http
Content-Security-Policy: frame-ancestors https://your-store.workers.dev
```

### postMessage 握手

插件从 `document.referrer` 获取父窗口 origin，不要使用 `"*"`：

```js
const parentOrigin = new URL(document.referrer).origin;
window.parent.postMessage({ type: "cloudcart:ready", pageId }, parentOrigin);
```

CloudCart 会返回：

```js
{
  type: "cloudcart:token",
  token,
  expiresAt,
  storeId,
  pluginId,
  pageId,
  permissions
}
```

需要刷新时发送：

```js
window.parent.postMessage({ type: "cloudcart:refresh-token" }, parentOrigin);
```

Token 只保存在内存，不要放进 URL、localStorage 或日志。

## 插件 API

带 JWT 调用：

```http
Authorization: Bearer <token>
```

| 端点 | 权限 |
|---|---|
| `GET /api/plugin/v1/store` | `store:read` |
| `GET /api/plugin/v1/products` | `products:read` |
| `GET /api/plugin/v1/products/:id` | `products:read` |
| `GET /api/plugin/v1/orders` | `orders:read` |
| `GET /api/plugin/v1/orders/:id` | `orders:read` |
| `GET/PUT /api/plugin/v1/settings` | `settings:read` / `settings:write` |
| `POST /api/plugin/v1/events` | `events:write` |

JWT 有效期 5 分钟，只对当前插件和当前商店有效，不能调用 `/api/admin/*`。

## CORS

CloudCart 使用精确 origin 白名单，不使用 `*`。插件后台 origin 必须与 Manifest 的 `admin.entryUrl` origin 一致。

## 支付插件

远程支付插件实现：

- `POST /payments/validate`
- `POST /payments/checkout`
- `POST /payments/verify-webhook`
- `POST /payments/status`
- `POST /payments/capture`
- `POST /payments/refund`

Webhook 验证后返回 CloudCart `PaymentEvent`，并带上内部 `orderId`。CloudCart 仍会校验金额、币种和幂等性，插件不能直接把订单改为已支付。

## 本地开发

生产必须 HTTPS。本地可以通过：

```bash
PLUGIN_ALLOW_INSECURE_ORIGINS=1
APP_ENV=development
```

允许 `http://127.0.0.1` / `http://localhost`。不要在生产环境开启。
