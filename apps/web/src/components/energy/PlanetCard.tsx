interface PlanetCardProps {
  name: string;
  planetTypeName?: string;
  maxTemp: number;
  bonus?: {
    mineraiBonus: number;
    siliciumBonus: number;
    hydrogeneBonus: number;
  };
}

function bonusTag(label: string, value: number) {
  if (!value || value === 1) return null;
  const percent = Math.round((value - 1) * 100);
  const positive = percent > 0;
  return (
    <span
      key={label}
      className={`text-[11px] px-2 py-0.5 rounded font-medium border ${
        positive
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-destructive/10 text-destructive border-destructive/20'
      }`}
    >
      {positive ? '+' : ''}{percent}% {label}
    </span>
  );
}

export function PlanetCard({ name, planetTypeName, maxTemp, bonus }: PlanetCardProps) {
  return (
    <div className="glass-card flex items-center gap-4 p-4">
      <div
        className="size-14 shrink-0 rounded-full shadow-lg shadow-primary/20"
        style={{
          background: 'radial-gradient(circle at 35% 35%, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0.2), hsl(var(--background)))',
        }}
      />
      <div className="flex-1 min-w-0">
        <h2 className="font-bold text-foreground tracking-wide truncate">{name}</h2>
        <p className="text-xs text-muted-foreground">
          {planetTypeName ?? 'Inconnue'} · {maxTemp}°C
        </p>
        {bonus && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {bonusTag('minerai', bonus.mineraiBonus)}
            {bonusTag('silicium', bonus.siliciumBonus)}
            {bonusTag('hydrogène', bonus.hydrogeneBonus)}
          </div>
        )}
      </div>
    </div>
  );
}
