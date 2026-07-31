import { registry } from "./registry";
import { GlassChatPlugin } from "./plugins/glasschat";

// Auto-register default plugins into the SwarmPlugins registry
registry.register(GlassChatPlugin);

export * from "./types";
export * from "./registry";
export * from "./plugins/glasschat";
