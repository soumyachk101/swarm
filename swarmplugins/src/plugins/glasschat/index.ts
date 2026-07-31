import type { SwarmPlugin } from "../../types";
import { GlassChatEmbed } from "./GlassChatEmbed";

export const GlassChatPlugin: SwarmPlugin = {
  manifest: {
    id: "glasschat",
    name: "GlassChat",
    version: "1.0.0",
    description: "Embedded team chat & customer support agent",
    category: "chat",
    ui: {
      surface: "dock",
      layout: "embedded",
      iconName: "MessageSquareText",
    },
  },
  Component: GlassChatEmbed,
};

export * from "./GlassChatEmbed";
export * from "./platformApi";
