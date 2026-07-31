"use client";

import { useProviderStore } from "@/features/settings/providerStore";
import { Check } from "lucide-react";
import { useState } from "react";
import { useSettingsStore } from "@/features/settings/settingsStore";

export default function ModelsSection() {
  const availableModels = useProviderStore((s) => s.availableModels);
  const providers = useProviderStore((s) => s.providers);

  const leadModel = useSettingsStore((s) => s.leadModel);
  const setLeadModel = useSettingsStore((s) => s.setLeadModel);

  const grouped: Record<string, typeof availableModels> = {};
  for (const m of availableModels) {
    if (!grouped[m.providerName]) grouped[m.providerName] = [];
    grouped[m.providerName].push(m);
  }

  const providerNames = providers
    .filter((p) => p.verified && p.enabled)
    .map((p) => p.name);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-swarm-text">Models</h2>
        <p className="text-micro text-swarm-textMuted mt-0.5">
          All models from verified providers. Select a model for Lead to use.
        </p>
      </div>

      {availableModels.length === 0 ? (
        <div className="text-xs text-swarm-textMuted glass-inset rounded-lg px-4 py-6 text-center border border-swarm-border/30">
          No models available. Connect a provider in the Providers section first.
        </div>
      ) : (
        <div className="space-y-3">
          {Object.entries(grouped).map(([providerName, models]) => (
            <div key={providerName} className="glass-inset rounded-lg border border-swarm-border/30 overflow-hidden">
              <div className="px-3 py-2 glass-inset border-b border-swarm-border/20">
                <span className="text-xs font-semibold text-swarm-textDim">{providerName}</span>
                <span className="text-micro text-swarm-textMuted ml-2">({models.length} models)</span>
              </div>
              <div className="divide-y divide-swarm-border/10">
                {models.map((m) => (
                  <label
                    key={`${m.providerId}-${m.model}`}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-swarm-border/20 cursor-pointer transition-colors"
                  >
                    <input
                      type="radio"
                      name="lead-model"
                      checked={leadModel === m.model}
                      onChange={() => setLeadModel(m.model)}
                      className="accent-swarm-gold"
                    />
                    <span className="flex-1 text-xs text-swarm-text font-mono">{m.model}</span>
                    <span className="text-micro px-1.5 py-0.5 rounded bg-swarm-gold/10 text-swarm-gold border border-swarm-gold/20">
                      {m.providerName}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
