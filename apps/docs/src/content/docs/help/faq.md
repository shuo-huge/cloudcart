---
title: 常见问题
description: 部署、域名、R2、邮件、税费、插件和数据的常见问题。
---

## 部署后找不到网站链接

一键部署在 Cloudflare 云端运行，不会自动打开你电脑的浏览器。

- 看最新 Build logs 最后的 `Website / 网站` 行
- 或 Workers & Pages → 你的项目 → **Visit**
- 地址格式：`https://<worker>.<子域>.workers.dev`

## Setup link 丢了

如果还没创建管理员，重新部署一次；脚本会生成新的 Setup link。

如果已经安装，直接访问 `/admin`。

## 必须使用 R2 吗

不需要。默认使用 HTTPS 图片外链。R2 只有在你需要直接上传图片时才需要启用。

## 能绑定自己的域名吗

可以。在 Cloudflare Worker → Settings → Domains & Routes 添加自定义域名。

远程插件、支付回调、邮件链接都会使用当前请求的 origin，所以换域名后一般不需要改代码。

## 邮件为什么没有发出去

检查：

- Email Notifications 插件是否启用
- 发件地址、API Key 或 `EMAIL` binding 是否配置
- 后台 Emails 发件箱的状态和错误
- 免费 Resend 额度或收件人限制

当前版本没有真实服务商投递测试，建议先用测试邮箱验证。

## 税费怎么算

税基是：

```text
max(0, 商品小计 - 折扣 + 运费)
```

支持含税价和不含税价，以及国家/地区覆盖规则。详见 [运费与税费](/admin/shipping-tax/)。

## 插件能安装别人写的吗

可以。远程插件通过 Manifest URL 安装，不需要重新部署 CloudCart。

但插件运行在作者自己的服务器上，安装前请检查权限。获得 `orders:read` 的插件可以读取订单信息。

## 远程插件为什么没有菜单

- 插件是否已启用
- Manifest 是否声明了 `admin.pages`
- 后台是否刷新过

启用/禁用后后台会自动刷新以更新菜单和 CSP。

## 数据归谁

数据在你自己的 Cloudflare 账号和 D1 数据库里。CloudCart 不托管你的商品、订单或客户数据。

## 能导出数据吗

可以直接使用 Cloudflare D1 的导出能力，或通过 API 读取。当前后台没有一键导出按钮。

## 为什么没有邮件/税费/插件市场

当前版本边界写在 [项目介绍](/getting-started/introduction/) 和仓库的 `README.md`。没有实现的能力不会被描述成已完成。
