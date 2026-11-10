---
title: 安装远程插件
description: 通过 Manifest URL 安装、启用和管理远程插件。
---

远程插件由插件作者独立部署。你只需要一个 Manifest URL。

## 安装

1. 打开 **后台 → Plugins**
2. 点击 **Install remote plugin**
3. 输入 Manifest URL，例如：

   ```text
   https://plugin.example.com/cloudcart-plugin.json
   ```

4. 点击 **Preview**
5. 检查插件名称、作者、版本、权限、后台菜单和服务地址
6. 如果插件服务已经配置了密钥，在 **Service secret** 中粘贴；留空则让 CloudCart 生成
7. 点击 **Install plugin**

安装完成后插件处于**禁用**状态。

## 启用

在 Plugins 列表找到插件，点击 **Enable**。

- 左侧会自动出现插件菜单
- 后台会执行一次健康检查
- 列表会显示远程服务的健康状态

点击插件菜单，插件页面会在后台内容区域打开。

## 服务密钥

如果 CloudCart 生成了密钥，安装完成后会**只显示一次**。你需要：

1. 立即复制
2. 配置到插件服务器的 `CLOUDCART_SERVICE_SECRET`
3. 点击 Done

如果密钥丢失，可以在插件上点击 **Update**，重新安装并生成新密钥；旧密钥配置需要同步更新。

## 权限

安装前会显示插件申请的权限：

- `store:read`
- `products:read`
- `orders:read`
- `settings:read` / `settings:write`
- `events:write`

只安装你信任的插件。获得 `orders:read` 的插件可以读取订单信息。

## 更新

点击 **Update**，重新输入当前 Manifest URL：

1. 预览新版本
2. 确认权限和后台页面
3. 更新

更新会保留启用状态和已有配置。如果服务域名变化，需要重新配置服务密钥。

## 健康检查

点击 **Health** 会调用插件服务的 `/health`。结果会显示在列表中。

## 卸载

点击 **Uninstall**：

- 插件菜单立即消失
- 插件被禁用
- 历史订单和支付交易保留
- 如果有待处理的支付，建议先完成

## 故障排查

| 现象 | 检查 |
|---|---|
| Manifest 读取失败 | URL 是否 HTTPS、是否公开、是否返回 JSON |
| 菜单不出现 | 插件是否启用、Manifest 是否声明 admin.pages |
| iframe 空白 | 插件是否允许商城后台作为 `frame-ancestors` |
| 插件 API 403 | 权限、origin、JWT 是否有效 |
| 健康检查失败 | 服务密钥是否一致、`/health` 是否实现 |
