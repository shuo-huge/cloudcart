import { useEffect, useState } from "preact/hooks";
import { adminGet } from "./api";
import type { PluginRow } from "./types";

export const PLUGINS_CHANGED_EVENT = "cloudcart:plugins-changed";

export interface PluginNavItem {
  pluginId: string;
  pluginName: string;
  pageId: string;
  label: string;
  icon?: string;
  path: string;
}

export function notifyPluginsChanged(): void {
  window.dispatchEvent(new CustomEvent(PLUGINS_CHANGED_EVENT));
}

export async function fetchPluginRows(): Promise<PluginRow[]> {
  return adminGet<PluginRow[]>("/plugins");
}

export function pluginNavItems(plugins: PluginRow[]): PluginNavItem[] {
  return plugins
    .filter((plugin) => plugin.enabled === 1 && plugin.runtime === "remote" && !plugin.bundled)
    .flatMap((plugin) => (plugin.adminPages ?? []).map((page) => ({
      pluginId: plugin.id,
      pluginName: plugin.name,
      pageId: page.id,
      label: page.label,
      icon: page.icon,
      path: `/plugins/${encodeURIComponent(plugin.id)}/${encodeURIComponent(page.id)}`,
    })));
}

export function usePluginNav(): PluginNavItem[] {
  const [items, setItems] = useState<PluginNavItem[]>([]);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const rows = await fetchPluginRows();
        if (active) setItems(pluginNavItems(rows));
      } catch {
        if (active) setItems([]);
      }
    };
    void load();
    const onChange = () => { void load(); };
    window.addEventListener(PLUGINS_CHANGED_EVENT, onChange);
    return () => {
      active = false;
      window.removeEventListener(PLUGINS_CHANGED_EVENT, onChange);
    };
  }, []);
  return items;
}
