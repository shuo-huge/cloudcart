import type { ThemeDefinition } from "@cloudcart/theme-sdk";
import defaultTheme from "@cloudcart/theme-default";
import fashionTheme from "@cloudcart/theme-fashion";
import beautyTheme from "@cloudcart/theme-beauty";
import electronicsTheme from "@cloudcart/theme-electronics";
import jewelryTheme from "@cloudcart/theme-jewelry";
import homeTheme from "@cloudcart/theme-home";
import sportsTheme from "@cloudcart/theme-sports";
import singleProductTheme from "@cloudcart/theme-single-product";

/**
 * Themes are bundled at build time. Adding a theme requires a rebuild; the
 * admin can only activate or configure themes present in this registry.
 */
const themes = new Map<string, ThemeDefinition>();

function register(theme: ThemeDefinition): void {
  themes.set(theme.manifest.id, theme);
}

register(defaultTheme);
register(fashionTheme);
register(beautyTheme);
register(electronicsTheme);
register(jewelryTheme);
register(homeTheme);
register(sportsTheme);
register(singleProductTheme);

export function getThemeDefinition(id: string): ThemeDefinition {
  return themes.get(id) ?? defaultTheme;
}

export function listThemeDefinitions(): ThemeDefinition[] {
  return [...themes.values()];
}

export function hasTheme(id: string): boolean {
  return themes.has(id);
}
