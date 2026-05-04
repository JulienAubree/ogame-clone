import { Link } from 'react-router';
import { Star, HelpCircle, ImageIcon, AlertTriangle } from 'lucide-react';
import { xpRequiredForLevel } from '@exilium/game-engine';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFlagshipImageUrl } from '@/lib/assets';
import { HullIcon } from '@/components/entity-details/stat-components';
import { HeroAtmosphere } from '@/components/common/HeroAtmosphere';
import { getHullCardStyles } from './hullCardStyles';

interface FlagshipLite {
  name: string;
  level?: number;
  xp?: number;
  hullId: string | null;
  status: string;
  flagshipImageIndex: number | null;
}

interface PlanetLite {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId?: string | null;
  planetImageIndex?: number | null;
}

interface HullConfigLite {
  id: string;
  name: string;
  description: string;
}

interface FlagshipHeroProps {
  flagship: FlagshipLite;
  hullConfig: HullConfigLite | null;
  stationedPlanet: PlanetLite | null;
  onOpenImagePicker: () => void;
  onOpenHullChange: () => void;
  onOpenHelp: () => void;
}

const MAX_LEVEL = 60;

const STATUS_BADGES: Record<string, { label: string; tone: string }> = {
  incapacitated: { label: 'Incapacité', tone: 'bg-red-500/20 border-red-500/40 text-red-200' },
  hull_refit: { label: 'Refit', tone: 'bg-amber-500/20 border-amber-500/40 text-amber-200' },
  in_mission: { label: 'En mission', tone: 'bg-blue-500/20 border-blue-500/40 text-blue-200' },
};

/**
 * V8-FlagshipRework : hero atmosphérique pour la page Vaisseau amiral.
 * Pattern aligné sur Anomaly IntroHero / FacilityHero : rond image cliquable
 * (ouvre l'aide), titre + niveau + XP au centre, boutons compacts à droite.
 */
export function FlagshipHero({
  flagship,
  hullConfig,
  stationedPlanet,
  onOpenImagePicker,
  onOpenHullChange,
  onOpenHelp,
}: FlagshipHeroProps) {
  const styles = getHullCardStyles(flagship.hullId);
  const level = flagship.level ?? 1;
  const xp = flagship.xp ?? 0;
  const isMaxLevel = level >= MAX_LEVEL;
  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = isMaxLevel ? xp : xpRequiredForLevel(level + 1);
  const xpProgress = isMaxLevel
    ? 1
    : nextLevelXp > currentLevelXp
      ? Math.max(0, Math.min(1, (xp - currentLevelXp) / (nextLevelXp - currentLevelXp)))
      : 0;

  const heroImage = flagship.flagshipImageIndex
    ? getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'full')
    : null;
  const thumbImage = flagship.flagshipImageIndex
    ? getFlagshipImageUrl(flagship.hullId ?? 'industrial', flagship.flagshipImageIndex, 'thumb')
    : null;

  const isImpaired = flagship.status === 'incapacitated' || flagship.status === 'hull_refit';
  const statusBadge = STATUS_BADGES[flagship.status];

  return (
    <div className="relative overflow-hidden">
      <HeroAtmosphere imageUrl={heroImage} variant="indigo" />

      {/* Subtle scanline overlay (cf RunHero) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-30 mix-blend-overlay"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(167,139,250,0.04), rgba(167,139,250,0.04) 1px, transparent 1px, transparent 3px)',
        }}
      />

      <div className="relative px-4 pt-6 pb-5 lg:px-8 lg:pt-10 lg:pb-7">
        <div className="flex items-start gap-3 sm:gap-4 lg:gap-5">
          {/* Cliquable round → opens FlagshipHelp */}
          <button
            type="button"
            onClick={onOpenHelp}
            className={cn(
              'relative group shrink-0 rounded-full transition-opacity',
              isImpaired && 'opacity-70',
            )}
            title="Comment fonctionne le vaisseau amiral ?"
          >
            {thumbImage ? (
              <img
                src={thumbImage}
                alt={flagship.name}
                className={cn(
                  'h-16 w-16 lg:h-24 lg:w-24 rounded-full border-2 object-cover shadow-lg shadow-violet-500/15 transition-opacity group-hover:opacity-80',
                  styles.border,
                )}
              />
            ) : (
              <div
                className={cn(
                  'h-16 w-16 lg:h-24 lg:w-24 rounded-full border-2 flex items-center justify-center bg-violet-950/50 shadow-lg shadow-violet-500/15 transition-opacity group-hover:opacity-80',
                  styles.border,
                )}
              >
                <HullIcon size={36} className={styles.badgeText} />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
              <HelpCircle className="h-5 w-5 text-white" />
            </div>
            {statusBadge && (
              <span
                className={cn(
                  'absolute -top-1 -right-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider shadow-sm',
                  statusBadge.tone,
                )}
                title={statusBadge.label}
              >
                <AlertTriangle className="h-2.5 w-2.5" />
                {statusBadge.label}
              </span>
            )}
          </button>

          {/* Center : name + level + planet */}
          <div className="flex-1 min-w-0 pt-0.5 lg:pt-1">
            <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-foreground truncate">
              {flagship.name}
            </h1>

            {/* Level + XP bar */}
            <div className="mt-1.5 flex items-center gap-2 max-w-md">
              <div className="flex items-center gap-1 shrink-0">
                <Star className="h-3.5 w-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-foreground tabular-nums">
                  Niv. {level}
                </span>
                <span className="text-[10px] text-muted-foreground/70">/ {MAX_LEVEL}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="h-1.5 rounded-full bg-violet-950/60 overflow-hidden border border-violet-500/10">
                  <div
                    className="h-full bg-gradient-to-r from-violet-400 to-yellow-400 transition-all"
                    style={{ width: `${Math.round(xpProgress * 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground/80 mt-0.5 font-mono tabular-nums">
                  {isMaxLevel
                    ? `${xp.toLocaleString('fr-FR')} XP (max)`
                    : `${xp.toLocaleString('fr-FR')} / ${nextLevelXp.toLocaleString('fr-FR')} XP`
                  }
                </div>
              </div>
            </div>

            {/* Stationed planet */}
            {stationedPlanet && (
              <Link
                to="/"
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="truncate max-w-[180px]">{stationedPlanet.name}</span>
                <span className="text-muted-foreground/50 font-mono text-[10px]">
                  [{stationedPlanet.galaxy}:{stationedPlanet.system}:{stationedPlanet.position}]
                </span>
              </Link>
            )}

            {hullConfig && (
              <div className="mt-1 hidden sm:block">
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                  styles.badge,
                  styles.badgeText,
                )}>
                  <HullIcon size={10} /> {hullConfig.name}
                </span>
              </div>
            )}
          </div>

          {/* Right : compact action buttons */}
          <div className="flex flex-col sm:flex-row gap-1.5 sm:gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenImagePicker}
              className="gap-1.5 border-violet-500/30 hover:bg-violet-950/40 hover:border-violet-400/60"
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Image</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenHullChange}
              disabled={flagship.status !== 'active'}
              className="gap-1.5 border-violet-500/30 hover:bg-violet-950/40 hover:border-violet-400/60"
              title={flagship.status !== 'active' ? 'Coque modifiable uniquement quand active' : undefined}
            >
              <HullIcon size={13} />
              <span className="hidden sm:inline">Coque</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
