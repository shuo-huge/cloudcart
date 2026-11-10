---
title: 主题与页面编辑器
description: 切换主题、编辑首页和内容页，并管理发布版本。
---

## 主题

**后台 → Themes** 显示 8 套内置主题：

Default、Fashion、Beauty、Electronics、Jewelry、Home、Sports、Single Product。

每套主题的布局、字体和商品卡片结构都不同。切换主题不会影响商品、订单和页面内容。

主题预览来自一张 4×2 的 WebP 图集，点击预览可以全屏查看。

## 页面编辑器

**后台 → Page Builder → 选择页面 → 编辑**。

编辑器分为三栏：

- **左侧**：添加区块、页面结构（可拖拽排序）
- **中间**：桌面/平板/手机实时预览
- **右侧**：选中区块的内容和样式设置

支持的区块包括：Hero、图片横幅、商品网格、精选分类、图文、富文本、视频、评价、FAQ、信任徽章、Logo 列表、间距、分割线、订阅、自定义 HTML 等。

## 自动保存

编辑后约 1.2 秒自动保存草稿。顶部会显示：

- All changes saved
- Saving…
- Unsaved changes
- Save failed

也可以点击 **Save** 手动保存。

## 预览

预览使用**未发布的草稿**，不会影响线上页面。可以切换：

- Desktop
- Tablet
- Mobile

## 发布

点击 **Publish** 会把当前草稿发布为新的不可变版本。

- 线上页面只读取已发布版本
- 后续草稿修改不会影响线上
- 发布后版本号递增

## 版本回滚

点击 **Versions** 查看已发布版本。选择旧版本点击 **Restore**：

1. 旧快照会写入当前草稿
2. 线上页面保持不变
3. 预览确认后点击 **Publish**
4. 发布会生成一个新版本

旧版本快照永远不会被修改或删除。

## 内容页

Page Builder 中还包含标准页面草稿：

About、Contact、FAQ、Shipping Policy、Returns & Refunds、Privacy Policy、Terms of Service、Payment Policy。

发布前请替换成真实商家信息，不要直接使用示例法律文本。

## 自定义 HTML

自定义 HTML 区块会经过白名单消毒，不允许脚本、iframe、事件处理器或 `javascript:` URL。
