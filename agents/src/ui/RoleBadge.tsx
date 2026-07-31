"use client";

export interface RoleBadgeProps {
  role: string;
  branchName?: string;
}

// Roles are told apart by the theme's own semantic ramp, not by stock Tailwind
// blue/purple/red. Those are fixed sRGB values: on the light themes they sat at
// ~2:1 against the surface and the badge text vanished, and they never followed
// an accent swap. Every theme defines gold/ok/honey/amber, so this reads on all
// eight and still gives each role its own hue.
const ROLE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  builder: { label: 'Builder', color: 'bg-swarm-gold/15 text-swarm-goldHi border-swarm-gold/25', dot: 'bg-swarm-gold shadow-glow' },
  reviewer: { label: 'Reviewer', color: 'bg-swarm-ok/12 text-swarm-ok border-swarm-ok/25', dot: 'bg-swarm-ok' },
  scout: { label: 'Scout', color: 'bg-swarm-honey/12 text-swarm-honey border-swarm-honey/25', dot: 'bg-swarm-honey' },
  coordinator: { label: 'Coordinator', color: 'bg-swarm-amber/12 text-swarm-amber border-swarm-amber/25', dot: 'bg-swarm-amber' },
};

const FALLBACK = {
  color: 'bg-swarm-textMuted/10 text-swarm-textDim border-swarm-textMuted/20',
  dot: 'bg-swarm-textMuted',
};

export default function RoleBadge({ role, branchName }: RoleBadgeProps) {
  const cfg = ROLE_CONFIG[role.toLowerCase()] ?? { label: role, ...FALLBACK };

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-micro font-medium ${cfg.color}`}
      title={branchName ? `${cfg.label} · ${branchName}` : cfg.label}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${cfg.dot}`} />
      {/* An unknown role is echoed verbatim, and agent roles can be arbitrary
          strings — without a cap one long label stretches the whole header row. */}
      <span className="truncate">{cfg.label}</span>
      {branchName && (
        <span className="ml-0.5 truncate font-mono text-micro opacity-60">
          {branchName}
        </span>
      )}
    </span>
  );
}
