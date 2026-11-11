import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const site = process.env.DOCS_SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  integrations: [
    starlight({
      title: {
        "zh-CN": "CloudCart 文档",
        en: "CloudCart Docs",
      },
      description: "CloudCart 使用、部署、主题与插件开发文档 / Documentation for running, deploying and extending CloudCart.",
      logo: {
        src: "./src/assets/logo.svg",
        alt: "CloudCart",
      },
      favicon: "/favicon.svg",
      head: [
        { tag: "link", attrs: { rel: "icon", href: "/favicon.ico", sizes: "any" } },
        { tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" } },
        { tag: "link", attrs: { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" } },
        { tag: "meta", attrs: { name: "theme-color", content: "#173d2b" } },
      ],
      defaultLocale: "root",
      locales: {
        root: { label: "简体中文", lang: "zh-CN" },
        en: { label: "English", lang: "en" },
      },
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/shuo-huge/cloudcart" },
      ],
      editLink: {
        baseUrl: "https://github.com/shuo-huge/cloudcart/edit/main/apps/docs/",
      },
      lastUpdated: true,
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      customCss: ["./src/styles/custom.css"],
      sidebar: [
        {
          label: "开始使用",
          translations: { en: "Getting started" },
          items: [
            { label: "项目介绍", translations: { en: "Introduction" }, slug: "getting-started/introduction" },
            { label: "本地开发", translations: { en: "Local development" }, slug: "getting-started/local-development" },
            { label: "一键部署", translations: { en: "One-click deploy" }, slug: "getting-started/one-click-deploy" },
            { label: "CLI 部署", translations: { en: "CLI deploy" }, slug: "getting-started/cli-deploy" },
            { label: "初始化后台", translations: { en: "Admin setup" }, slug: "getting-started/setup" },
          ],
        },
        {
          label: "后台使用",
          translations: { en: "Admin" },
          items: [
            { label: "商品与分类", translations: { en: "Products & categories" }, slug: "admin/products" },
            { label: "订单与履约", translations: { en: "Orders & fulfilment" }, slug: "admin/orders" },
            { label: "运费与税费", translations: { en: "Shipping & tax" }, slug: "admin/shipping-tax" },
            { label: "主题与页面编辑器", translations: { en: "Themes & page editor" }, slug: "admin/themes-pages" },
            { label: "图片与媒体", translations: { en: "Media" }, slug: "admin/media" },
            { label: "邮件通知", translations: { en: "Email notifications" }, slug: "admin/email" },
            { label: "店铺设置", translations: { en: "Store settings" }, slug: "admin/settings" },
          ],
        },
        {
          label: "插件",
          translations: { en: "Plugins" },
          items: [
            { label: "插件概览", translations: { en: "Plugin overview" }, slug: "plugins/overview" },
            { label: "安装远程插件", translations: { en: "Install remote plugins" }, slug: "plugins/remote-install" },
            { label: "开发远程插件", translations: { en: "Develop remote plugins" }, slug: "plugins/remote-development" },
          ],
        },
        {
          label: "开发者",
          translations: { en: "Developers" },
          items: [
            { label: "架构概览", translations: { en: "Architecture" }, slug: "developers/architecture" },
            { label: "主题开发", translations: { en: "Theme development" }, slug: "developers/themes" },
            { label: "插件开发", translations: { en: "Plugin development" }, slug: "developers/plugins" },
            { label: "支付集成", translations: { en: "Payment integration" }, slug: "developers/payments" },
            { label: "CLI 与智能体", translations: { en: "CLI & agents" }, slug: "developers/cli" },
          ],
        },
        {
          label: "帮助",
          translations: { en: "Help" },
          items: [
            { label: "常见问题", translations: { en: "FAQ" }, slug: "help/faq" },
            { label: "测试与验证", translations: { en: "Testing & verification" }, slug: "help/testing" },
          ],
        },
      ],
    }),
  ],
});
