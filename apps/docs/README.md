# CloudCart 文档站

使用 [Astro Starlight](https://starlight.astro.build/) 构建的公开文档站，独立于商城 Worker 部署。

## 本地开发

```bash
pnpm --filter @cloudcart/docs dev
```

默认地址：`http://localhost:4321`

## 构建

```bash
pnpm --filter @cloudcart/docs build
```

产物：`apps/docs/dist`

## 修改内容

- 中文页面（默认语言，`/`）：`src/content/docs/**/*.md`
- 英文页面（`/en/`）：`src/content/docs/en/**/*.md`
- 左侧目录：`astro.config.mjs` 的 `sidebar`；英文标签写在每项的 `translations.en`
- 主题样式：`src/styles/custom.css`
- Logo：`src/assets/logo.svg`
- Favicon / App icon：由仓库根目录 `brand/` 生成，`public/` 中保存文档站使用的副本
- 重新生成图标：在仓库根目录执行 `pnpm icons`（需要已安装 Playwright Chromium）

新增页面时：

1. 在 `src/content/docs` 下新建中文 `.md` 文件
2. 在 `src/content/docs/en` 下新建相同路径的英文 `.md` 文件
3. 两边都加 frontmatter：

   ```yaml
   ---
   title: 页面标题
   description: 一句话描述
   ---
   ```

4. 在 `astro.config.mjs` 的 `sidebar` 中加一条 `{ label, translations: { en: "..." }, slug }`

`slug` 是相对 `src/content/docs` 的路径，不带 `.md`。英文页面里的站内链接要加 `/en` 前缀，例如 `/en/getting-started/introduction/`。

语言切换由 Starlight 根据 `locales` 自动生成；新增语言时同时配置 `locales`、页面目录和 sidebar `translations`。

## Cloudflare 部署

### 方式一：Cloudflare Pages

- Build command：`pnpm --filter @cloudcart/docs build`
- Output directory：`apps/docs/dist`
- 根目录：仓库根目录

### 方式二：Workers Static Assets

```bash
DOCS_SITE_URL=https://cloudcart-docs.cloudcart-shuo-preview.workers.dev pnpm run docs:deploy
```

该命令会构建文档并使用 `wrangler.docs.jsonc` 部署独立的 `cloudcart-docs` Worker。设置 `DOCS_SITE_URL` 后，中英文页面的 canonical URL 和 sitemap 都会使用正式域名。

自定义域名在 Cloudflare Dashboard 的 Worker/Pages 设置中添加。

## 内容写作约定

- 一页只解决一个明确问题
- 先给结论，再给步骤
- 命令、路径、代码用代码块
- 未实现/未验证的能力必须明确标注
- 不要复制大量会随版本过期的内部实现细节，链接到仓库 `docs/` 即可
