---
title: CLI 与智能体
description: 用命令行和 API Key 让 Claude Code、Cursor、Codex 等智能体直接管理商品、页面、博客、订单和营销。
---

CloudCart 自带一个零依赖的 Node CLI，位于 `apps/cli`。它把后台 API 封装成命令，适合人类和智能体使用：

- 不需要浏览器 Cookie，使用长期 API Key
- `--json` 输出稳定，便于智能体解析
- `--dry-run` 先看计划，`--yes` 才执行删除
- 支持商品、图片、分类、页面、博客、订单、客户、优惠券、运费和税费

## 首次登录

```bash
pnpm cloudcart auth login --url https://your-store.example.com --email owner@example.com
```

命令会用管理员密码登录，自动创建一个 API Key，保存到当前用户目录，然后退出临时会话。密码在终端中隐藏输入，也可以用 `--password-stdin` 或 `CLOUDCART_PASSWORD`。

非交互智能体推荐直接使用环境变量：

```bash
export CLOUDCART_URL=https://your-store.example.com
export CLOUDCART_API_KEY=cck_...
pnpm cloudcart products list --json
```

已有 Key 可以保存到本地：

```bash
pnpm cloudcart auth login --url https://... --key cck_...
```

## 上传商品

```bash
pnpm cloudcart products create \
  --name "Canvas Tote" \
  --price 25.00 \
  --status active \
  --stock 20 \
  --tag bags \
  --image https://example.com/tote.jpg \
  --json
```

网络图片默认会下载并写入配置好的存储；`--external` 才保留外链。本地文件用 `--image-file ./photo.jpg`，并通过 `--storage r2|jsdelivr` 选择存储。

更新商品：

```bash
pnpm cloudcart products update PRODUCT_ID --price 29.50 --status active --json
```

`products update` 会先读取现有商品再合并字段，避免 API 的全量 PUT 把未提供的字段重置。

## 图片托管：R2 / jsDelivr

商品图片有三种常见托管方式：

1. **Cloudflare R2**：配置 `MEDIA` 绑定后，`pnpm cloudcart media upload --storage r2` 直接上传，图片由 Worker 的 `/media/*` 提供。
2. **jsDelivr**：在 Admin → Settings → Media storage 配置公开 GitHub 仓库和 PAT 后，`--storage jsdelivr` 会由 Worker 调用 GitHub Contents API 上传。
3. **外部 HTTPS 链接**：`media add-url` 或 `--external` 只登记地址，不复制文件。

```bash
pnpm cloudcart media upload ./photo.jpg --storage jsdelivr --json
pnpm cloudcart media import-url https://example.com/a.jpg --storage jsdelivr --json
pnpm cloudcart products images attach PRODUCT_ID --image-url https://example.com/a.jpg --storage jsdelivr --json
pnpm cloudcart products images attach PRODUCT_ID --image-url https://example.com/a.jpg --external --json
```

手动发布脚本仍然可用：

```bash
pnpm publish:jsdelivr --repo ../cloudcart-media --dest products \
  --tag v1 ./photo-1.jpg ./photo-2.jpg
```

脚本会复制图片、提交、打 tag、推送，并输出：

```text
https://cdn.jsdelivr.net/gh/<owner>/cloudcart-media@v1/products/photo-1.jpg
```

然后引用到商品：

```bash
pnpm cloudcart products images attach PRODUCT_ID \
  --image-url https://cdn.jsdelivr.net/gh/.../photo-1.jpg --external
```

`--dry-run` 只打印计划，不修改 git。

:::caution
jsDelivr 主要面向开源项目，不是通用商业图床。长期用于商业商品目录可能违反其条款。生产环境优先使用 R2 或 Cloudflare Pages/Workers 静态资源。
:::

## 新建页面

```bash
pnpm cloudcart pages create --title "About us" --slug about-us
pnpm cloudcart pages draft about-us --data page.json
pnpm cloudcart pages publish about-us
```

`page.json` 是页面编辑器使用的 PageDocument；可以先运行：

```bash
pnpm cloudcart schema page
```

## 上传博客

CloudCart 目前没有独立的博客表。CLI 的 `blog` 命令复用内容页：每篇文章是一个 `/pages/<slug>` 页面，正文放在 `rich-text` section。

```bash
pnpm cloudcart blog create \
  --title "Launch notes" \
  --slug launch-notes \
  --text-file post.html \
  --excerpt "What is new this week" \
  --cover-image https://example.com/cover.jpg \
  --publish \
  --json
```

限制：

- 没有 `/blog` 列表、RSS、作者/日期/标签等博客元数据
- 正文是 HTML，不自动转换 Markdown
- 可以另外创建一个 `/pages/blog` 页面，手动链接各篇文章

## 订单与营销

```bash
pnpm cloudcart orders list --json
pnpm cloudcart orders ship ORDER_ID --carrier UPS --tracking-number 1Z...
pnpm cloudcart orders returns ORDER_ID --json
pnpm cloudcart orders return ORDER_ID --item ORDER_ITEM_ID:1 --restock --yes --json
pnpm cloudcart coupons create --code SAVE10 --type percent --value 10 --json
pnpm cloudcart tax create --name "CA tax" --country US --region CA --rate-percent 8.25
```

## 智能体接入

先让智能体发现命令和参数：

```bash
pnpm cloudcart capabilities --json
pnpm cloudcart schema product
pnpm cloudcart schema coupon
```

推荐工作流：

1. 读取 `capabilities`，确认命令和所需 scope。
2. 读取 `schema`，构造 payload。
3. 写操作先加 `--json --dry-run`。
4. 确认后去掉 `--dry-run`；删除/取消加 `--yes`。
5. 不要把 `CLOUDCART_API_KEY` 写进日志或提交到仓库。

Claude Code、Cursor、Codex、Gemini CLI 等只要能执行 shell 命令，就可以直接调用；仓库根目录的 `AGENTS.md` 提供了精简的智能体提示。

## API Key 安全

- Key 在 D1 中只保存 SHA-256 哈希，明文只在创建时显示一次
- Key 按资源限权，例如 `products:write`、`pages:read`、`orders:write`
- 不能修改管理员密码、创建其他 Key 或管理插件
- 修改管理员密码会撤销该管理员的全部 API Key
- `pnpm cloudcart auth logout` 撤销当前 Key 并删除本地配置

### 网络问题

如果 `workers.dev` 被 DNS 污染，CLI 会显示 `fetch failed`。Node 24 可以通过环境代理访问：

```bash
NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7897 \
  pnpm cloudcart products list --json
```

也可以把商店绑定到自己的域名，或换一个能解析 `workers.dev` 的网络。

## 其他命令

```bash
pnpm cloudcart auth status
pnpm cloudcart auth whoami
pnpm cloudcart keys list
pnpm cloudcart api GET /api/admin/dashboard --json
pnpm cloudcart doctor
```

完整命令参考见仓库 [`docs/CLI.md`](https://github.com/shuo-huge/cloudcart/blob/main/docs/CLI.md)。
