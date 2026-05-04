import { useState } from 'react';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import { xpRequiredForLevel } from '@exilium/game-engine';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl, getPlanetImageUrl } from '@/lib/assets';
import { HullIcon } from '@/components/entity-details/stat-components';
import { getHullCardStyles } from './hullCardStyles';

const STATUS_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  active: { label: 'Operationnel', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  in_mission: { label: 'En mission', color: 'text-blue-400', dot: 'bg-blue-400' },
  incapacitated: { label: 'Incapacité', color: 'text-red-400', dot: 'bg-red-400' },
  hull_refit: { label: 'Changement de coque', color: 'text-amber-400', dot: 'bg-amber-400' },
};

interface FlagshipLite {
  name: string;
  description: string;
  status: string;
  hullId: string | null;
  flagshipImageIndex: number | null;
  hullChangeAvailableAt?: string | Date | null;
}

interface PlanetLite {
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId?: string | null;
  planetImageIndex?: number | null;
}

interface HullConfigLite {
  name: string;
}

interface FlagshipIdentityCardProps {
  flagship: FlagshipLite;
  hullConfig: HullConfigLite | null;
  flagshipImages: number[] | undefined;
  stationedPlanet: PlanetLite | null;
  balance: number;
  onOpenImagePicker: () => void;
  onOpenHullChange: () => void;
}

export function FlagshipIdentityCard({
  flagship,
  hullConfig,
  flagshipImages,
  stationedPlanet,
  balance,
  onOpenImagePicker,
  onOpenHullChange,
}: FlagshipIdentityCardProps) {
  const utils = trpc.useUtils();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const renameMutation = trpc.flagship.rename.useMutation({
    onSuccess: () => {
      utils.flagship.get.invalidate();
      setEditingName(false);
    },
  });

  const styles = getHullCardStyles(flagship.hullId);
  const status = STATUS_LABELS[flagship.status] ?? {
    label: flagship.status,
    color: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
  };

  const maxLevel = 60;
  const flagshipLevel = (flagship as { level?: number }).level ?? 1;
  const flagshipXp = (flagship as { xp?: number }).xp ?? 0;
  const currentLevelXp = xpRequiredForLevel(flagshipLevel);
  const nextLevelXp = flagshipLevel >= maxLevel ? flagshipXp : xpRequiredForLevel(flagshipLevel + 1);
  const xpProgress = flagshipLevel >= maxLevel
    ? 1
    : (flagshipXp - currentLevelXp) / (nextLevelXp - currentLevelXp);

  function startEditName() {
    setName(flagship.name);
    setDescription(flagship.description);
    setEditingName(true);
  }

  function handleRename() {
    if (name.length < 2 || name.length > 32) return;
    renameMutation.mutate({ name, description: description || undefined });
  }

  return (
    <div className={cn('glass-card p-4 lg:p-5 border relative', styles.border, styles.glow)}>
      {hullConfig && (
        <span className={cn(
          'absolute top-3 right-3 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
          styles.badge,
          styles.badgeText,
        )}>
          {hullConfig.name}
        </span>
      )}
      <div className="flex gap-4 lg:gap-5">
        {/* Image — fixed size */}
        <div className="relative flex-shrink-0">
          {flagship.flagshipImageIndex ? (
            <img
              src={getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'thumb')}
              alt={flagship.name}
              className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-xl object-cover border border-white/10"
            />
          ) : (
            <div className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-xl bg-primary/10 border border-white/10 flex items-center justify-center text-3xl sm:text-4xl lg:text-5xl font-black text-primary/20">
              VA
            </div>
          )}
          {flagshipImages && flagshipImages.length > 0 && (
            <button
              onClick={onOpenImagePicker}
              className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full px-2.5 py-1 text-[10px] font-medium bg-black/70 backdrop-blur-sm text-white/70 hover:text-white hover:bg-black/90 transition-colors border border-white/10 whitespace-nowrap"
            >
              Changer
            </button>
          )}
        </div>

        {/* Name + status + planet */}
        <div className="flex-1 min-w-0 space-y-2">
          {editingName ? (
            <div className="space-y-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={32}
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-lg font-bold"
                autoFocus
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={256}
                rows={2}
                placeholder="Description (optionnel)"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              />
              <div className="flex items-center gap-2 justify-end text-xs">
                <span className="text-muted-foreground">{name.length}/32</span>
                <button onClick={() => setEditingName(false)} className="text-muted-foreground hover:text-foreground">Annuler</button>
                <button onClick={handleRename} disabled={name.length < 2 || renameMutation.isPending} className="text-primary hover:text-primary/80 disabled:opacity-50">
                  {renameMutation.isPending ? '...' : 'Enregistrer'}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl lg:text-2xl font-bold truncate">{flagship.name}</h2>
                <button onClick={startEditName} className="text-[11px] text-muted-foreground/50 hover:text-primary transition-colors flex-shrink-0">
                  Renommer
                </button>
              </div>
              {hullConfig && (
                <button
                  onClick={onOpenHullChange}
                  disabled={flagship.status !== 'active'}
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-card/80 px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <HullIcon size={13} />
                  Changer de coque
                </button>
              )}
              {flagship.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{flagship.description}</p>
              )}
            </div>
          )}

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', status.dot)} />
            <span className={cn('text-xs font-medium', status.color)}>{status.label}</span>
          </div>

          {/* Planet + Exilium — inline */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            {stationedPlanet && (
              <Link to="/" className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                {stationedPlanet.planetClassId && stationedPlanet.planetImageIndex != null ? (
                  <img
                    src={getPlanetImageUrl(stationedPlanet.planetClassId, stationedPlanet.planetImageIndex, 'icon')}
                    alt=""
                    className="w-5 h-5 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20" />
                )}
                <span>{stationedPlanet.name}</span>
                <span className="text-muted-foreground/40 text-[10px]">[{stationedPlanet.galaxy}:{stationedPlanet.system}:{stationedPlanet.position}]</span>
              </Link>
            )}
            <span className="text-primary font-medium">{balance} Exilium</span>
          </div>

          {/* Quick links */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            <Link to="/fleet" className="text-[11px] text-primary/70 hover:text-primary transition-colors">Flotte</Link>
            <Link to="/fleet/movements" className="text-[11px] text-primary/70 hover:text-primary transition-colors">Mouvements</Link>
          </div>
        </div>
      </div>

      {/* Level + XP bar */}
      <div className="flex items-center gap-3 text-sm border-t border-panel-border pt-3 mt-3">
        <div className="flex items-center gap-1.5">
          <Star className="h-4 w-4 text-yellow-400" />
          <span className="font-bold">Niveau {flagshipLevel}</span>
          <span className="text-gray-500">/ {maxLevel}</span>
        </div>
        <div className="flex-1">
          <div className="h-1.5 bg-panel-light/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-yellow-400/80 transition-all"
              style={{ width: `${Math.round(xpProgress * 100)}%` }}
            />
          </div>
          <div className="text-xs text-gray-500 mt-0.5">
            {flagshipLevel >= maxLevel
              ? `${flagshipXp.toLocaleString()} XP (max)`
              : `${flagshipXp.toLocaleString()} / ${nextLevelXp.toLocaleString()} XP`
            }
          </div>
        </div>
      </div>
    </div>
  );
}
