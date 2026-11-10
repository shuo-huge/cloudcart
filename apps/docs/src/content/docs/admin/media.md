---
title: 图片与媒体
description: 本地上传图片，并在 R2 与 jsDelivr 之间切换存储；商品图片排序与外链图片。
---

CloudCart 支持三种图片来源：

- **本地上传**：在商品编辑页或媒体库选择文件，自动写入当前存储
- **R2**：部署配置了 `MEDIA` binding 时可用，图片由 Worker `/media/*` 提供
- **jsDelivr**：通过 GitHub 公共仓库发布，返回 jsDelivr CDN 地址

此外仍支持**外部 HTTPS 图片链接**作为高级选项，不复制文件。

## 在商品编辑页上传

进入 **后台 → 商品 → 编辑 → Media**：

1. 选择存储：R2 或 jsDelivr
2. 选择本地图片（JPEG / PNG / GIF / WebP / AVIF，最大 5 MB）
3. 点击 **Upload**
4. 图片会加入媒体网格；第一张是商城封面

拖拽图片左上角手柄可以排序。上传控件位于媒体网格外，不会影响拖拽顺序。

## 在媒体库上传

**后台 → Media** 提供相同的存储选择和上传控件。列表会显示每张图片的来源：R2、jsDelivr 或 External。

## 配置存储

### R2（可选）

R2 只有在这个部署存在 `MEDIA` binding 时可用。启用方式：

1. 在 Cloudflare 创建 R2 bucket
2. 在 `wrangler.jsonc` 添加：

```jsonc
"r2_buckets": [
  { "binding": "MEDIA", "bucket_name": "cloudcart-media" }
]
```

3. 重新部署

当前一键部署默认不创建 R2；没有 R2 时后台会显示 “R2 — not configured”。

### jsDelivr（GitHub）

1. 创建一个**公开** GitHub 仓库（例如 `your-name/cloudcart-media`）
2. 创建 fine-grained PAT，只授权该仓库的 **Contents: Read and write**
3. 后台 **Settings → Media storage** 填写：
   - Repository owner
   - Repository name
   - Branch（通常是 `main`）
   - Folder path（例如 `products`）
   - GitHub token
4. 点击 **Save storage settings**，再点击 **Test jsDelivr**

Token 使用 `APP_MASTER_KEY` 派生的 AES-GCM 密钥加密保存，API 只返回 `tokenConfigured`，不会返回明文。

上传后 Worker 调用 GitHub Contents API 创建 commit，并使用 commit SHA 生成稳定地址：

```text
https://cdn.jsdelivr.net/gh/<owner>/<repo>@<commit-sha>/products/<file>.jpg
```

:::caution
jsDelivr 主要面向开源项目，不是通用商业图床。商业商品目录长期使用可能违反其条款；生产环境更推荐 R2。
:::

## 外链图片（高级）

商品 Media 和媒体库底部有 **Advanced: external image URL**。它只登记地址，不下载、不复制文件。

要求：

- 必须是 `https://`
- 不能是 localhost、私有 IP 或内网地址
- 不能包含用户名/密码

## 存储切换

- **默认存储**：Settings → Media storage
- **单次上传**：上传控件中的 Storage 下拉框
- 不可用的 provider 会禁用并显示原因
- CLI 使用 `--storage r2|jsdelivr`；网络图片默认会下载并写入存储，`--external` 才保留外链

## 限制

- 最大 5 MB；JPEG/PNG/GIF/WebP/AVIF；SVG 被拒绝
- 不自动删除 jsDelivr/GitHub 远端文件；删除媒体只移除 D1 记录和商品关联
- GitHub token 失效或权限不足时上传会失败，Settings 的 Test 按钮可诊断
- 外部 URL 不受存储配置影响，也不会计入媒体存储用量
