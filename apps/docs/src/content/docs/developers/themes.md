---
title: 主题开发
description: 创建、注册和测试一套 CloudCart 主题。
---

主题在构建时打包，后台只能切换和修改设计变量，不能在运行时上传主题代码。

## 目录结构

```text
themes/example/
  theme.json        # 历史元数据（运行时以 src/index.ts 为准）
  package.json
  src/index.ts      # 运行时 ThemeDefinition
```

## ThemeDefinition

```ts
interface ThemeDefinition {
  manifest: ThemeManifest;
  css: string;
  renderHome(ctx, data): string;
  renderProduct(ctx, data): string;
  renderCollection(ctx, data): string;
  renderCart(ctx, data): string;
  renderCheckout(ctx, data): string;
  renderContent(ctx, data): string;
  renderNotFound?(ctx): string;
}
```

## 注册主题

1. 在 `themes/` 创建包
2. 在 `apps/worker/src/theme-registry.ts` 导入并注册
3. 加入 `apps/worker/package.json` 依赖
4. 重新构建和部署

## 设计变量

`manifest.designTokens` 定义可配置的颜色、字体、间距等。后台主题设置会写入 `theme_settings`，渲染时作为 CSS 变量。

## 预览图

预览图来自：

```text
apps/storefront/public/themes/theme-previews-atlas.webp
```

后台用 CSS `background-position` 裁剪 4×2 图集。新增主题时需要同步更新图集和 `admin.css`。

## 主题能力

- 首页、商品、分类、搜索、购物车、结账、内容页、404
- 页头、页脚、移动端菜单
- 商品卡片、商品详情画廊
- 购物车和订单摘要
- 页面编辑器区块渲染

所有主题共享 `packages/theme-sdk/src/types.ts` 的数据模型。

## 测试

```bash
pnpm typecheck
pnpm test
pnpm test:e2e
```

Vitest 会验证主题切换后前台 markup 变化且商品数据不变；Playwright 覆盖主题预览弹窗和响应式布局。

## 开发建议

- 不要在主题中直接查询 D1
- 所有动态值使用 `escapeHtml` / `escapeAttr`
- 不要注入未消毒 HTML
- 保持移动端优先
- 主题 CSS 不要依赖外部 CDN
