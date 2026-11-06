import "./storefront.css";
import { CartStore, bindCartButtons, bindCartPage } from "./cart";
import { bindNewsletterForms } from "./newsletter";

declare global {
  interface Window {
    CloudCart?: { cart: CartStore };
  }
}

const cart = new CartStore();
window.CloudCart = { cart };

bindCartButtons(cart);
bindCartPage(cart);
bindNewsletterForms();
