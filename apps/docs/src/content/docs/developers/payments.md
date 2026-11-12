---
title: 支付集成
description: Manual、Stripe、PayPal 和远程支付插件的工作方式。
---

## 支付方式

CloudCart 内置：

- **Manual**：银行转账、货到付款、自定义说明
- **Stripe Checkout**
- **PayPal Orders v2**

也支持远程支付插件，通过同一套 `PaymentPlugin` 契约运行在插件作者的服务上。

## 结账流程

1. 顾客选择支付方式
2. 服务端确认该方式已启用
3. 加载支付配置
4. 调用 `createCheckout`
5. 返回 redirect 或 pending
6. 支付完成后 webhook 或 return capture
7. `processPaymentEvent` 校验金额/币种/幂等
8. 订单变为 `paid`

## 配置

**后台 → Payments**：

- 启用/禁用支付方式
- 填写密钥
- 查看 webhook URL

支付密钥使用 AES-GCM 加密，永远不会返回浏览器。

## Webhook

| 服务商 | 地址 |
|---|---|
| Stripe | `/webhooks/stripe` |
| PayPal | `/webhooks/paypal` |
| 远程插件 | `/webhooks/<plugin-id>` |

要求：

- 使用原始请求体验证签名
- 事件 id 唯一
- 金额和币种必须匹配订单
- 返回 400 让服务商重试

## 退款

**后台 → 订单详情 → Refund**。

- 只有 `paid` 或 `partially_refunded` 订单可以退款，金额不能超过剩余可退金额
- Manual：只登记本地退款记录，不移动资金
- Stripe/PayPal：先调用服务商退款，再写入本地记录
- 远程插件：调用插件的退款端点
- 部分退款和累计退款回调会按剩余金额校验，重复回调不会重复累加

退款不会删除订单和交易记录。

## 远程支付插件

远程插件实现：

```ts
validateConfig
createCheckout
verifyWebhook
getPaymentStatus
captureOrder?
refund?
```

实际调用通过 HMAC 签名的 HTTPS 请求完成。CloudCart 永远保留金额校验权，远程插件不能直接修改订单状态。

## 测试

支付服务商 API 在自动化测试中使用 mock。Stripe Sandbox 已于 2026-11-11 使用测试卡完成真实支付与 webhook 验证；PayPal Sandbox 仍待补充，上线前请用 Sandbox 账号完整走一遍。

## 安全建议

- 不要在客户端计算金额
- 不要把支付密钥写进前端
- 定期轮换密钥
- 启用 webhook 签名校验
- 不要在日志中打印完整 provider payload
