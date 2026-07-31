import type { SwarmPlugin, PluginManifest } from "./types";

class PluginRegistry {
  private plugins: Map<string, SwarmPlugin> = new Map();

  /** Register a new third-party or built-in plugin */
  public register(plugin: SwarmPlugin): void {
    if (this.plugins.has(plugin.manifest.id)) {
      console.warn(`[SwarmPlugins] Overwriting plugin registration: ${plugin.manifest.id}`);
    }
    this.plugins.set(plugin.manifest.id, plugin);
  }

  /** Get a registered plugin by ID */
  public get(id: string): SwarmPlugin | undefined {
    return this.plugins.get(id);
  }

  /** List all registered plugins */
  public getAll(): SwarmPlugin[] {
    return Array.from(this.plugins.values());
  }

  /** Get plugins matching a specific UI surface */
  public getBySurface(surface: "dock" | "plane" | "sidebar"): SwarmPlugin[] {
    return this.getAll().filter((p) => p.manifest.ui.surface === surface);
  }
}

export const registry = new PluginRegistry();
