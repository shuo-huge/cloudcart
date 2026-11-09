import { matchRoute, usePath } from "./router";
import { CategoriesPage } from "./pages/Categories";
import { CustomersPage, CustomerDetailPage } from "./pages/Customers";
import { DashboardPage } from "./pages/Dashboard";
import { DiscountsPage } from "./pages/Discounts";
import { EmailsPage } from "./pages/Emails";
import { MediaPage } from "./pages/Media";
import { OrdersPage, OrderDetailPage } from "./pages/Orders";
import { PagesPage } from "./pages/Pages";
import { PageEditorPage } from "./pages/PageEditor";
import { PaymentsPage } from "./pages/Payments";
import { PluginsPage } from "./pages/Plugins";
import { ProductEditorPage, ProductsPage } from "./pages/Products";
import { RemotePluginPage } from "./pages/RemotePluginPage";
import { SeoPage } from "./pages/Seo";
import { SettingsPage } from "./pages/Settings";
import { ShippingPage } from "./pages/Shipping";
import { ThemesPage } from "./pages/Themes";
import { NotFoundPage } from "./pages/NotFound";

export function Routes() {
  const path = usePath();

  if (matchRoute(path, "/")) return <DashboardPage />;
  if (matchRoute(path, "/products")) return <ProductsPage />;
  if (matchRoute(path, "/products/new")) return <ProductEditorPage id={null} />;
  const product = matchRoute(path, "/products/:id");
  if (product) return <ProductEditorPage id={product.id!} />;
  if (matchRoute(path, "/categories")) return <CategoriesPage />;
  if (matchRoute(path, "/orders")) return <OrdersPage />;
  const order = matchRoute(path, "/orders/:id");
  if (order) return <OrderDetailPage id={order.id!} />;
  if (matchRoute(path, "/customers")) return <CustomersPage />;
  const customer = matchRoute(path, "/customers/:id");
  if (customer) return <CustomerDetailPage id={customer.id!} />;
  if (matchRoute(path, "/discounts")) return <DiscountsPage />;
  if (matchRoute(path, "/pages")) return <PagesPage />;
  const pageEditor = matchRoute(path, "/pages/:slug/edit");
  if (pageEditor) return <PageEditorPage slug={pageEditor.slug!} />;
  if (matchRoute(path, "/themes")) return <ThemesPage />;
  const remotePluginPage = matchRoute(path, "/plugins/:pluginId/:pageId");
  if (remotePluginPage) {
    return <RemotePluginPage pluginId={remotePluginPage.pluginId!} pageId={remotePluginPage.pageId!} />;
  }
  if (matchRoute(path, "/plugins")) return <PluginsPage />;
  if (matchRoute(path, "/emails")) return <EmailsPage />;
  if (matchRoute(path, "/payments")) return <PaymentsPage />;
  if (matchRoute(path, "/shipping")) return <ShippingPage />;
  if (matchRoute(path, "/seo")) return <SeoPage />;
  if (matchRoute(path, "/media")) return <MediaPage />;
  if (matchRoute(path, "/settings")) return <SettingsPage />;
  return <NotFoundPage />;
}
