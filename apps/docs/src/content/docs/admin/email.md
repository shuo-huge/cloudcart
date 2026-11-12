---
title: 邮件通知
description: 配置 Resend 或 Cloudflare Email Workers，发送订单邮件。
---

CloudCart 内置 **Email Notifications** 插件，默认关闭。

## 支持的事件

- 下单成功
- 付款确认
- 订单发货
- 订单取消
- 退款

邮件会包含订单号、商品、金额、税费、收货地址、物流信息和私有订单链接。配置了店铺邮箱且开启「抄送店铺」时，会同时给店铺发一份。

## 启用插件

**后台 → Plugins → Email Notifications → Enable**。

然后进入 **后台 → Emails** 配置。

## 发送通道

### Resend

1. 注册 Resend 并创建 API Key
2. 在 Email 设置中选择 `Resend`
3. 填写发件地址和 API Key
4. 保存

### Cloudflare Email Workers

需要：

- 自有域名并启用 Email Routing
- 在 `wrangler.jsonc` 添加 `send_email` binding

```jsonc
"send_email": [{ "name": "EMAIL" }]
```

然后在 Email 设置中选择 `Cloudflare Email Workers`。

## 测试投递

保存设置并启用插件后，在 **Emails → Test delivery** 填写收件地址，点击 **Send test email**。CloudCart 会使用当前 Resend 或 Cloudflare 通道真实发送一封测试邮件。

## 发件箱

**后台 → Emails** 下半部分显示发件箱：

- Queued：排队中
- Sending：发送中
- Sent：已发送
- Failed：失败

失败会记录错误并按 1、5、15、60、360 分钟退避重试。Worker 每 5 分钟的定时任务会自动处理到期重试；也可以在下一次订单事件或手动点击 **Process queue / Retry failed** 时触发。

## 安全

- Resend API Key 使用 AES-GCM 加密存储
- 后台日志不会返回邮件正文
- 邮件发送失败不会影响下单或付款
- 配置错误时订单仍然正常，只是不会发信

## 注意

当前版本没有真实邮件服务商投递测试；建议上线前先用测试邮箱验证一次。
