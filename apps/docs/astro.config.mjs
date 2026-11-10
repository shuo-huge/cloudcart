import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

const site = process.env.DOCS_SITE_URL;

export default defineConfig({
  ...(site ? { site } : {}),
  integrations: [
    starlight({
      title: "CloudCart 文档",
      description: "CloudCart 使用、部署、主题与插件开发文档。",
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
          items: [
            { label: "项目介绍", slug: "getting-started/introduction" },
            { label: "本地开发", slug: "getting-started/local-development" },
            { label: "一键部署", slug: "getting-started/one-click-deploy" },
            { label: "CLI 部署", slug: "getting-started/cli-deploy" },
            { label: "初始化后台", slug: "getting-started/setup" },
          ],
        },
        {
          label: "后台使用",
          items: [
            { label: "商品与分类", slug: "admin/products" },
            { label: "订单与履约", slug: "admin/orders" },
            { label: "运费与税费", slug: "admin/shipping-tax" },
            { label: "主题与页面编辑器", slug: "admin/themes-pages" },
            { label: "图片与媒体", slug: "admin/media" },
            { label: "邮件通知", slug: "admin/email" },
            { label: "店铺设置", slug: "admin/settings" },
          ],
        },
        {
          label: "插件",
          items: [
            { label: "插件概览", slug: "plugins/overview" },
            { label: "安装远程插件", slug: "plugins/remote-install" },
            { label: "开发远程插件", slug: "plugins/remote-development" },
          ],
        },
        {
          label: "开发者",
          items: [
            { label: "架构概览", slug: "developers/architecture" },
            { label: "主题开发", slug: "developers/themes" },
            { label: "插件开发", slug: "developers/plugins" },
            { label: "支付集成", slug: "developers/payments" },
            { label: "CLI 与智能体", slug: "developers/cli" },
          ],
        },
        {
          label: "帮助",
          items: [
            { label: "常见问题", slug: "help/faq" },
            { label: "测试与验证", slug: "help/testing" },
          ],
        },
      ],
    }),
  ],
});
