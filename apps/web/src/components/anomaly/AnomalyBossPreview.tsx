import { Heart, Shield, Skull, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Timer } from '@/components/common/Timer';
import { useGameConfig } from '@/hooks/useGameConfig';
import { formatNumber } from '@/lib/format';

/** Description courte des skills boss côté UI (i18n FR). Doit rester aligné
 *  avec la liste BOSS_SKILLS dans anomaly-bosses.types.ts. */
const SKILL_LABELS: Record<string, string> = {
  armor_pierce:    'Perforation',
  regen:           'Régénération',
  shield_aura:     'Aura de bouclier',
  damage_burst:    'Salve dévastatrice',
  summon_drones:   'Invocation',
  disable_battery: 'Brouillage',
  armor_corrosion: 'Corrosion',
  last_stand:     "Sursaut d'agonie",
  evasion:         'Esquive',
  rafale_swarm:    'Essaim de rafales',
};

const SKILL_DESC: Record<string, (m: number) => string> = {
  armor_pierce:    (m) => `Ignore ${Math.round(m * 100)}% de votre blindage`,
  regen:           (m) => `Récupère ${Math.round(m * 100)}% de coque par round`,
  shield_aura:     (m) => `Bouclier de départ ×${m.toFixed(1)}`,
  damage_burst:    (m) => `Un round à dégâts ×${m.toFixed(1)}`,
  summon_drones:   (m) => `+${Math.floor(m)} intercepteurs au round 1`,
  disable_battery: (m) => `-${Math.floor(m)} batteries flagship au round 1`,
  armor_corrosion: (m) => `-${Math.round(m * 100)}% de blindage par round`,
  last_stand:     ()  => 'Survit une fois à un coup mortel',
  evasion:         (m) => `${Math.round(m * 100)}% de chance d'esquiver`,
  rafale_swarm:    (m) => `Rafales boss ×${m.toFixed(1)}`,
};

interface BossSkillEntry {
  type: string;
  magnitude: number;
}

interface BossStatsLite {
  hull: number;
  shield: number;
  armor: number;
  weapons: number;
  shotCount: number;
}

interface BossEntry {
  id: string;
  name: string;
  title: string;
  description: string;
  image?: string;
  skills: BossSkillEntry[];
  /** V9.2 — Si présent, le boss apparaît comme une unité distincte avec HP bar. */
  bossStats?: BossStatsLite | null;
}

interface Props {
  /** Boss à afficher — résolu côté parent depuis la pool (anomaly.bossesPool). */
  boss: BossEntry;
  /** 1-based number of the depth the player is about to engage. */
  depth: number;
  /** Pre-generated enemy fleet (shipId → count). */
  enemyFleet?: Record<string, number> | null;
  enemyFp?: number | null;
  ready: boolean;
  disabled: boolean;
  totalShips: number;
  nextAt: Date | null;
  advancePending: boolean;
  onAdvance: () => void;
}

/**
 * Hero card affichée à la place de AnomalyCombatPreview quand le prochain
 * noeud est un boss. Tons rouge / sombre, badges skills, CTA dramatique.
 */
export function AnomalyBossPreview({
  boss,
  depth,
  enemyFleet,
  enemyFp,
  ready,
  disabled,
  totalShips,
  nextAt,
  advancePending,
  onAdvance,
}: Props) {
  const { data: gameConfig } = useGameConfig();
  const bossUnitKey = `boss:${boss.id}`;
  // V9.2 — sépare le boss-as-unit des escortes (id préfixé `boss:` n'est
  // pas dans game-config, donc on le filtre explicitement).
  const enemies = enemyFleet
    ? Object.entries(enemyFleet).filter(([id]) => id !== bossUnitKey)
    : [];
  const hasEnemies = enemies.length > 0;
  const hasBossUnit = !!boss.bossStats;
  const escortLabel = hasBossUnit ? 'Escortes' : 'Escorte boss';

  return (
    <div className="border-t border-border/30 pt-4 -mx-2">
      <div className="relative overflow-hidden rounded-xl border border-rose-500/40 bg-gradient-to-b from-rose-950/50 via-slate-950 to-black shadow-[0_0_24px_rgba(244,63,94,0.15)]">
        {/* Boss illustration */}
        <BossIllustration depth={depth} boss={boss} />

        {/* Header narratif */}
        <div className="px-4 sm:px-5 pt-4 pb-3 space-y-2 border-b border-rose-500/20">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] font-mono font-semibold text-rose-300">
            <Skull className="h-3 w-3 animate-pulse" />
            Boss · profondeur {String(depth).padStart(2, '0')}
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-rose-100 tracking-tight">
            {boss.name}
          </h3>
          {boss.title && (
            <p className="text-sm text-rose-300/80 italic">{boss.title}</p>
          )}
          {boss.description && (
            <p className="text-sm text-foreground/75 italic leading-relaxed whitespace-pre-line pt-1">
              {boss.description}
            </p>
          )}
        </div>

        {/* Skills tags */}
        {boss.skills.length > 0 && (
          <div className="px-4 sm:px-5 py-3 border-b border-rose-500/15 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-rose-300/80">
              Capacités
            </div>
            <div className="flex flex-wrap gap-1.5">
              {boss.skills.map((sk, i) => (
                <div
                  key={`${sk.type}-${i}`}
                  className="inline-flex flex-col rounded-md border border-rose-500/35 bg-rose-500/10 px-2.5 py-1.5"
                  title={SKILL_DESC[sk.type]?.(sk.magnitude) ?? sk.type}
                >
                  <span className="text-[10px] font-mono uppercase tracking-wider text-rose-200 font-semibold">
                    {SKILL_LABELS[sk.type] ?? sk.type}
                  </span>
                  <span className="text-[10px] text-rose-300/85 leading-tight">
                    {SKILL_DESC[sk.type]?.(sk.magnitude) ?? `magnitude ${sk.magnitude}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* V9.2 — Stats boss (HP bar) si bossStats défini */}
        {hasBossUnit && boss.bossStats && (
          <BossStatsBlock stats={boss.bossStats} />
        )}

        {/* Bloc menace */}
        <div className="px-4 sm:px-5 py-3 space-y-3">
          {hasEnemies ? (
            <div className="rounded-lg border border-rose-500/35 bg-rose-500/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-300 font-semibold">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                  {escortLabel}
                </div>
                {enemyFp != null && (
                  <span className="text-rose-200 font-bold tabular-nums text-sm">
                    ~{formatNumber(enemyFp)} FP
                  </span>
                )}
              </div>
              <ul className="space-y-1 text-sm">
                {enemies.map(([shipId, count]) => {
                  const def = gameConfig?.ships?.[shipId];
                  return (
                    <li key={shipId} className="flex items-center justify-between">
                      <span className="text-foreground/85">{def?.name ?? shipId}</span>
                      <span className="text-rose-200/90 tabular-nums">×{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-border/30 bg-card/30 p-3 text-xs text-muted-foreground/80 text-center">
              {hasBossUnit
                ? "Le boss se dresse seul — pas d'escorte."
                : "Composition ennemie non disponible — l'anomalie brouille vos capteurs."}
            </div>
          )}

          {/* CTA combat */}
          {ready ? (
            <Button
              onClick={onAdvance}
              disabled={advancePending || disabled || totalShips === 0}
              className="w-full bg-rose-600 hover:bg-rose-700 shadow-lg shadow-rose-500/25"
              size="lg"
            >
              <Swords className="h-4 w-4 mr-2" />
              {advancePending ? 'Combat en cours…' : 'Affronter le boss'}
            </Button>
          ) : (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/[0.06] p-3 flex items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Approche du boss —</span>
              <Timer endTime={nextAt!} className="font-mono text-rose-200 tabular-nums font-semibold" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * V9.2 — Bloc HP/shield/armor du boss-as-unit. Affiché entre les skills et
 * les escortes pour bien marquer la séparation : le boss a sa barre, l'escorte
 * sa liste. Pas de vraie barre de damage en preview (full HP avant combat),
 * mais on affiche les stats brutes pour donner une idée de la difficulté.
 */
function BossStatsBlock({ stats }: { stats: BossStatsLite }) {
  return (
    <div className="px-4 sm:px-5 py-3 border-b border-rose-500/15 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-rose-300/80">
          Coque ennemie
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono tabular-nums text-rose-200">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3 text-rose-400" />
            {formatNumber(stats.hull)}
          </span>
          <span className="inline-flex items-center gap-1">
            <Shield className="h-3 w-3 text-sky-300" />
            {formatNumber(stats.shield)}
          </span>
          {stats.armor > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-200/90">
              ◆ {formatNumber(stats.armor)}
            </span>
          )}
        </div>
      </div>
      {/* Barre HP visuelle (full pour le preview pre-combat) */}
      <div className="h-2 rounded-full bg-rose-950/60 overflow-hidden border border-rose-500/30">
        <div
          className="h-full bg-gradient-to-r from-rose-500 via-rose-400 to-rose-500"
          style={{ width: '100%' }}
        />
      </div>
      <div className="flex items-center justify-between text-[10px] font-mono text-rose-300/70">
        <span>
          {formatNumber(stats.weapons)} dmg × {stats.shotCount} tir{stats.shotCount > 1 ? 's' : ''}
        </span>
        <span>Ciblé en dernier</span>
      </div>
    </div>
  );
}

function BossIllustration({ depth, boss }: { depth: number; boss: BossEntry }) {
  return (
    <div className="relative h-48 sm:h-56 lg:h-64 w-full overflow-hidden">
      {boss.image ? (
        <img
          src={boss.image}
          alt={boss.name}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
        />
      ) : (
        // Fallback : dégradé rouge-noir + glyph crâne au centre.
        <div className="absolute inset-0 bg-gradient-to-br from-rose-950 via-slate-950 to-black flex items-center justify-center">
          <Skull className="h-20 w-20 text-rose-500/30" />
        </div>
      )}

      {/* Vignette */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />

      {/* Étiquette de profondeur */}
      <div className="absolute left-4 top-4 sm:left-5 sm:top-5">
        <div className="inline-flex items-center gap-2 rounded-md border border-rose-300/40 bg-black/70 backdrop-blur px-2.5 py-1">
          <Skull className="h-3 w-3 text-rose-300" />
          <span className="text-[10px] uppercase tracking-[0.18em] text-rose-200 font-semibold">
            Boss · prof
          </span>
          <span className="text-base font-bold text-rose-50 tabular-nums leading-none">
            {String(depth).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
}
