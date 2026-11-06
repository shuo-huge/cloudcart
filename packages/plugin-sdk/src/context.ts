import type { PluginManifest } from "./manifest";

export interface PluginRegistryEntry {
  manifest: PluginManifest;
  /** Present only when the plugin code is bundled into this Worker build. */
  plugin?: unknown;
}
