---
title: 一键部署
description: 使用 README 中的 Deploy to Cloudflare 按钮部署到自己的 Cloudflare 账号。
---

README 顶部有一个 **Deploy to Cloudflare** 按钮。它会克隆公开仓库，在你的 Cloudflare 账号中创建 Worker 和 D1，并运行仓库里的构建/部署脚本。

## 部署前准备

- 一个 Cloudflare 账号
- 可以访问 GitHub 公开仓库
- 不需要提前创建 D1，也不需要手动填写任何密钥

## 操作步骤

1. 点击 README 中的 **Deploy to Cloudflare** 按钮。
2. 登录 Cloudflare，选择要部署到的账号。
3. 确认项目名称，按提示继续。
4. 等待构建和部署完成。
5. 打开最新一次 **Build logs / 构建日志**，在最后找到：

```text
YOUR STORE IS READY / 商城已部署

Website / 网站:  https://xxx.workers.dev
Admin / 后台:    https://xxx.workers.dev/admin

Finish setup / 打开下面链接创建管理员（一次性，请勿分享）:
https://xxx.workers.dev/setup?token=...
```

## 部署后在哪里找网站链接

一键部署运行在 Cloudflare 云端，**无法自动打开你电脑上的浏览器**。可以从两处找到网址：

1. **构建日志**：Workers & Pages → 你的项目 → Deployments → 最新一次 → Build logs。日志最后有 `Website / 网站` 行。
2. **Dashboard**：Workers & Pages → 你的项目 → **Visit**。地址是：

```text
https://<worker-name>.<你的账号子域>.workers.dev
```

也可以在 **Settings → Domains & Routes** 中查看。

## 安装链接丢了怎么办

如果还没创建管理员就丢失了 Setup link，重新执行一次部署即可。脚本会检测到商城尚未初始化，生成并打印新的一次性链接。

如果已经创建过管理员，不需要 Setup link，直接打开 `/admin` 登录。

## 部署脚本做了什么

- 查找或复用 Deploy Button 创建的 D1 数据库
- 把真实数据库 ID 写回 `wrangler.jsonc`
- 构建前台和后台
- 通过 `DB` 绑定执行远程迁移
- 部署 Worker
- 保留或生成 `APP_MASTER_KEY`
- 在商城未初始化时生成一次性 `SETUP_TOKEN`
- 打印商城、后台和 Setup link

重复部署是安全的：已有资源和密钥会复用，不会覆盖业务数据。

## 注意事项

- 默认不创建 R2，图片使用 HTTPS 外链。
- 远程插件的公网 HTTPS 服务需要单独部署，不由商城 Worker 托管。
- 如果你在 Cloudflare 里手动绑定了自定义域名，以后就用自定义域名访问。
