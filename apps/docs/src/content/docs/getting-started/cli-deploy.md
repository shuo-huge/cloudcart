---
title: CLI 部署
description: 使用本地命令行完整部署 CloudCart，部署完成后自动打开安装页。
---

如果你希望部署完成后**自动打开**商城/安装页面，推荐使用 CLI 部署。

```bash
git clone https://github.com/shuo-huge/cloudcart.git
cd cloudcart
pnpm install
pnpm run deploy:cloudflare
```

## 脚本会做什么

1. 检查 Node、Wrangler 和 Cloudflare 登录状态
2. 查找或创建 D1 数据库
3. 把真实 ID 写入 `wrangler.jsonc`
4. 构建前台和后台
5. 通过 `DB` 绑定执行远程迁移
6. 部署 Worker
7. 保留或生成 `APP_MASTER_KEY`
8. 在商城未初始化时生成并刷新 `SETUP_TOKEN`
9. 打印商城、后台和一次性安装链接
10. 在本地交互式终端中自动打开安装页

## 常用参数

```bash
pnpm run deploy:cloudflare -- --name my-store   # 指定 Worker/资源名称
pnpm run deploy:cloudflare -- --check           # 只检查环境，不修改资源
pnpm run deploy:cloudflare -- --no-open         # 不自动打开浏览器
```

也可以设置环境变量 `CLOUDCART_NO_OPEN=1` 关闭自动打开。

## 重复部署

脚本是幂等的：

- 已存在的 D1 会复用
- 已有的 `APP_MASTER_KEY` 会保留
- 已初始化商城不会再生成 Setup link
- 不会覆盖商品、订单等业务数据

## 手动登录

如果脚本提示未登录：

```bash
npx wrangler login
```

登录后重新执行部署命令。

## 与一键部署的区别

| | 一键部署按钮 | CLI |
|---|---|---|
| 运行位置 | Cloudflare 云端 | 你的电脑 |
| 自动打开浏览器 | 不能 | 可以 |
| 需要本地 Node/pnpm | 不需要 | 需要 |
| 适合 | 快速上线 | 需要自动打开、指定名称、反复部署 |
