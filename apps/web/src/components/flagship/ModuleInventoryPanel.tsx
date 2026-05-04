import { useState, useMemo, useEffect } from 'react';
import { Search, X, Crosshair, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModuleTooltip } from './ModuleTooltip';
import { getHullCardStyles } from './hullCardStyles';

/** V8.5 — Thumbnail icon utilisé dans la liste d'inventaire.
 *  - Image module si dispo (rendered en object-cover, dot rareté top-left)
 *  - Sinon icône Crosshair pour les armes / Sparkles pour les passives,
 *    teintée selon la rareté. Carré 32×32 fixe, ne prend pas plus de place
 *    que les boutons à côté. */
const RARITY_DOT_THUMB: Record<string, string> = {
  common: 'bg-gray-400',
  rare:   'bg-blue-400',
  epic:   'bg-violet-400 shadow-[0_0_4px_rgba(167,139,250,0.5)]',
};

const RARITY_TINT: Record<string, string> = {
  common: 'text-gray-300',
  rare:   'text-blue-300',
  epic:   'text-violet-300',
};

function ModuleThumbnail({ module }: { module: InventoryItem }) {
  const isWeapon = (module.kind ?? 'passive') === 'weapon';
  return (
    <div className="relative shrink-0 h-9 w-9 rounded-md overflow-hidden bg-card/40 border border-border/40">
      {module.image ? (
        <img
          src={`${module.image}-thumb.webp`}
          alt={module.name}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
          {isWeapon ? (
            <Crosshair className={cn('h-4 w-4', RARITY_TINT[module.rarity] ?? 'text-foreground/60')} />
          ) : (
            <Sparkles className={cn('h-4 w-4', RARITY_TINT[module.rarity] ?? 'text-foreground/60')} />
          )}
        </div>
      )}
      <span
        className={cn(
          'absolute top-0.5 left-0.5 h-1.5 w-1.5 rounded-full',
          RARITY_DOT_THUMB[module.rarity] ?? RARITY_DOT_THUMB.common,
        )}
        aria-hidden
      />
    </div>
  );
}

interface InventoryItem {
  moduleId: string;
  count: number;
  hullId: string;
  rarity: string;
  name: string;
  description: string;
  image: string;
  enabled: boolean;
  effect?: unknown;
  /** V7-WeaponProfiles : kind ('passive' | 'weapon'). */
  kind?: string;
}

/**
 * V8.3-FlagshipModulesUX : pendingSlot mirrors the parent's PendingSlot type
 * (passive vs weapon Arsenal). Used to auto-apply the kind filter and to
 * display the "→ Équiper dans" context banner. Override-able by the user.
 */
type PendingSlot =
  | { kind: 'passive'; slotType: 'epic' | 'rare' | 'common'; slotIndex: number }
  | { kind: 'weapon'; rarity: 'common' | 'rare' | 'epic' };

interface Props {
  items: InventoryItem[];
  hullFilter: string;
  pendingSlot: PendingSlot | null;
  equippedIds: Set<string>;
  onEquip: (moduleId: string) => void;
  onDetails: (moduleId: string) => void;
  onClearPending: () => void;
}

interface CanEquipResult {
  ok: boolean;
  /** Reason shown as title attribute (tooltip natif) si !ok. */
  reason?: string;
}

/**
 * V8.3-FlagshipModulesUX : un module n'est cliquable "Équiper" que si on a
 * sélectionné un slot ET que la rareté + kind matchent. Sinon on désactive
 * pour éviter un appel mutation qui no-op silencieusement.
 */
function canEquipInPending(m: InventoryItem, pendingSlot: PendingSlot | null): CanEquipResult {
  if (!pendingSlot) return { ok: false, reason: 'Sélectionne d\'abord un slot dans la grille' };
  const k = moduleKind(m);
  if (pendingSlot.kind === 'weapon') {
    if (k !== 'weapon') return { ok: false, reason: 'Slot Arsenal : seules les armes peuvent être équipées' };
    if (m.rarity !== pendingSlot.rarity) return { ok: false, reason: `Rareté incompatible (slot ${RARITY_LABEL[pendingSlot.rarity]})` };
  } else {
    if (k === 'weapon') return { ok: false, reason: 'Slot passif : pas d\'arme. Utilise un slot Arsenal.' };
    if (m.rarity !== pendingSlot.slotType) return { ok: false, reason: `Rareté incompatible (slot ${RARITY_LABEL[pendingSlot.slotType]})` };
  }
  return { ok: true };
}

const RARITY_TONE: Record<string, string> = {
  common: 'text-gray-400 border-gray-400/30',
  rare:   'text-blue-300 border-blue-400/40',
  epic:   'text-violet-300 border-violet-400/50',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Commun',
  rare: 'Rare',
  epic: 'Épique',
};

type KindFilter = 'all' | 'passive' | 'weapon';
type RarityFilter = 'all' | 'common' | 'rare' | 'epic';

function moduleKind(m: InventoryItem): 'passive' | 'weapon' {
  return ((m.kind ?? 'passive') as 'passive' | 'weapon');
}

export function ModuleInventoryPanel({
  items, hullFilter, pendingSlot, equippedIds, onEquip, onDetails, onClearPending,
}: Props) {
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const hullStyles = getHullCardStyles(hullFilter);

  // V8.3-FlagshipModulesUX : auto-apply kind+rarity quand un slot est pending.
  // L'utilisateur peut quand même override en cliquant sur les filtres.
  // On ne ré-applique l'auto qu'au passage d'un nouveau pendingSlot, pas
  // à chaque render (sinon on annule l'override en boucle).
  useEffect(() => {
    if (!pendingSlot) return;
    if (pendingSlot.kind === 'weapon') {
      setKindFilter('weapon');
      setRarityFilter(pendingSlot.rarity);
    } else {
      setKindFilter('passive');
      setRarityFilter(pendingSlot.slotType);
    }
  }, [pendingSlot]);

  const filtered = useMemo(() => {
    return items
      .filter((m) => m.hullId === hullFilter)
      .filter((m) => kindFilter === 'all' || moduleKind(m) === kindFilter)
      .filter((m) => rarityFilter === 'all' || m.rarity === rarityFilter)
      .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => {
        const order = { epic: 0, rare: 1, common: 2 };
        if (a.rarity !== b.rarity) return (order[a.rarity as keyof typeof order] ?? 3) - (order[b.rarity as keyof typeof order] ?? 3);
        return a.name.localeCompare(b.name);
      });
  }, [items, hullFilter, kindFilter, rarityFilter, search]);

  // Group by kind only when the user is on "Tous" (kindFilter='all').
  const grouped = useMemo(() => {
    if (kindFilter !== 'all') return null;
    const passives = filtered.filter((m) => moduleKind(m) === 'passive');
    const weapons = filtered.filter((m) => moduleKind(m) === 'weapon');
    return { passives, weapons };
  }, [filtered, kindFilter]);

  // Pending banner label
  const pendingLabel = pendingSlot
    ? pendingSlot.kind === 'weapon'
      ? `Arsenal ${RARITY_LABEL[pendingSlot.rarity].toLowerCase()}`
      : pendingSlot.slotType === 'epic'
        ? 'Slot épique passif'
        : `Slot ${RARITY_LABEL[pendingSlot.slotType].toLowerCase()} #${pendingSlot.slotIndex + 1}`
    : null;

  return (
    <div className="space-y-3">
      {/* Pending slot banner — context explicite pour l'utilisateur */}
      {pendingSlot && pendingLabel && (
        <div className={cn(
          'flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
          pendingSlot.kind === 'weapon'
            ? 'border-orange-500/50 bg-orange-950/30 text-orange-100'
            : 'border-violet-500/50 bg-violet-950/30 text-violet-100',
        )}>
          <ArrowRight className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[10px] uppercase tracking-wider opacity-70">Équiper dans</span>
          <span className="font-semibold truncate">{pendingLabel}</span>
          <button
            type="button"
            onClick={onClearPending}
            aria-label="Annuler la sélection de slot"
            className="ml-auto rounded p-0.5 hover:bg-white/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
        <input
          type="text"
          placeholder="Rechercher un module ou une arme…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-md border border-border/40 bg-card/30 pl-7 pr-2 py-1.5 text-xs focus:outline-none focus:border-border focus:bg-card/50 transition-colors"
        />
      </div>

      {/* Kind filter — Tous / Modules / Armes */}
      <div className="space-y-1.5">
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-mono">Type</div>
        <div className="flex gap-1">
          <KindButton
            active={kindFilter === 'all'}
            onClick={() => setKindFilter('all')}
            label="Tous"
            hullStyles={hullStyles}
          />
          <KindButton
            active={kindFilter === 'passive'}
            onClick={() => setKindFilter('passive')}
            label="Modules"
            icon={<Sparkles className="h-3 w-3" />}
            hullStyles={hullStyles}
          />
          <KindButton
            active={kindFilter === 'weapon'}
            onClick={() => setKindFilter('weapon')}
            label="Armes"
            icon={<Crosshair className="h-3 w-3" />}
            hullStyles={hullStyles}
          />
        </div>
      </div>

      {/* Rarity filter */}
      <div className="space-y-1.5">
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground/60 font-mono">Rareté</div>
        <div className="flex gap-1">
          {(['all', 'common', 'rare', 'epic'] as const).map((r) => (
            <RarityButton
              key={r}
              active={rarityFilter === r}
              onClick={() => setRarityFilter(r)}
              rarity={r}
              hullStyles={hullStyles}
            />
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
        {filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground italic text-center p-4">
            Aucun module disponible avec ces filtres.
          </p>
        ) : grouped ? (
          <>
            {grouped.passives.length > 0 && (
              <SectionGroup
                label="Modules passifs"
                icon={<Sparkles className="h-3 w-3" />}
                count={grouped.passives.length}
                accent="violet"
                items={grouped.passives}
                equippedIds={equippedIds}
                pendingSlot={pendingSlot}
                onEquip={onEquip}
                onDetails={onDetails}
              />
            )}
            {grouped.weapons.length > 0 && (
              <SectionGroup
                label="Armes"
                icon={<Crosshair className="h-3 w-3" />}
                count={grouped.weapons.length}
                accent="orange"
                items={grouped.weapons}
                equippedIds={equippedIds}
                pendingSlot={pendingSlot}
                onEquip={onEquip}
                onDetails={onDetails}
              />
            )}
          </>
        ) : (
          <ItemList
            items={filtered}
            equippedIds={equippedIds}
            pendingSlot={pendingSlot}
            onEquip={onEquip}
            onDetails={onDetails}
          />
        )}
      </div>
    </div>
  );
}

// ─── Kind button ─────────────────────────────────────────────────────────────

function KindButton({
  active, onClick, label, icon, hullStyles,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
  hullStyles: ReturnType<typeof getHullCardStyles>;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 inline-flex items-center justify-center gap-1 rounded text-[11px] font-mono py-1.5 border transition-colors',
        active
          ? cn('font-semibold', hullStyles.border, hullStyles.badge, hullStyles.badgeText)
          : 'border-border/30 bg-card/20 text-muted-foreground hover:bg-card/40 hover:text-foreground/80',
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Rarity button ───────────────────────────────────────────────────────────

const RARITY_BUTTON_ACTIVE: Record<RarityFilter, string> = {
  all:    'border-foreground/40 bg-foreground/10 text-foreground font-semibold',
  common: 'border-gray-400/60 bg-gray-400/15 text-gray-100 font-semibold',
  rare:   'border-blue-400/60 bg-blue-400/15 text-blue-100 font-semibold',
  epic:   'border-violet-400/60 bg-violet-400/15 text-violet-100 font-semibold',
};

function RarityButton({
  active, onClick, rarity, hullStyles: _hullStyles,
}: {
  active: boolean;
  onClick: () => void;
  rarity: RarityFilter;
  hullStyles: ReturnType<typeof getHullCardStyles>;
}) {
  const label = rarity === 'all' ? 'Tous' : RARITY_LABEL[rarity];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded text-[10px] uppercase font-mono py-1 border transition-colors',
        active
          ? RARITY_BUTTON_ACTIVE[rarity]
          : 'border-border/30 bg-card/20 text-muted-foreground hover:bg-card/40 hover:text-foreground/80',
      )}
    >
      {label}
    </button>
  );
}

// ─── Section header for grouped view ─────────────────────────────────────────

function SectionGroup({
  label, icon, count, accent, items, equippedIds, pendingSlot, onEquip, onDetails,
}: {
  label: string;
  icon: React.ReactNode;
  count: number;
  accent: 'violet' | 'orange';
  items: InventoryItem[];
  equippedIds: Set<string>;
  pendingSlot: PendingSlot | null;
  onEquip: (moduleId: string) => void;
  onDetails: (moduleId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className={cn(
        'flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider',
        accent === 'violet' ? 'text-violet-300' : 'text-orange-300',
      )}>
        <span className={cn(
          'h-1.5 w-1.5 rounded-full',
          accent === 'violet' ? 'bg-violet-400' : 'bg-orange-400',
        )} />
        {icon}
        <span>{label}</span>
        <span className="text-muted-foreground/60 font-normal">({count})</span>
      </div>
      <ItemList
        items={items}
        equippedIds={equippedIds}
        pendingSlot={pendingSlot}
        onEquip={onEquip}
        onDetails={onDetails}
      />
    </div>
  );
}

// ─── Item list ───────────────────────────────────────────────────────────────

function ItemList({
  items, equippedIds, pendingSlot, onEquip, onDetails,
}: {
  items: InventoryItem[];
  equippedIds: Set<string>;
  pendingSlot: PendingSlot | null;
  onEquip: (moduleId: string) => void;
  onDetails: (moduleId: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {items.map((m) => {
        const equipped = equippedIds.has(m.moduleId);
        const canEquip = canEquipInPending(m, pendingSlot);
        const equipDisabled = equipped || !canEquip.ok;
        return (
          <li key={m.moduleId} className={cn(
            'flex items-center gap-2 p-1.5 rounded border',
            RARITY_TONE[m.rarity] ?? '',
            equipped && 'opacity-50',
          )}>
            <ModuleTooltip
              module={{
                id: m.moduleId, name: m.name, description: m.description,
                rarity: m.rarity, kind: m.kind, effect: m.effect,
              }}
              placement="right"
              wrapperClassName="flex-1 min-w-0 block"
            >
              <div className="flex flex-1 min-w-0 cursor-help items-center gap-2">
                {/* Thumbnail icon */}
                <ModuleThumbnail module={m} />
                {/* Name + description */}
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-foreground/90 truncate flex items-center gap-1">
                    {m.name}
                    {m.count > 1 && <span className="text-[9px] text-muted-foreground">×{m.count}</span>}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{m.description}</div>
                </div>
              </div>
            </ModuleTooltip>
            <button
              onClick={() => onDetails(m.moduleId)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >Détails</button>
            <button
              onClick={() => onEquip(m.moduleId)}
              disabled={equipDisabled}
              title={equipped ? 'Déjà équipé' : !canEquip.ok ? canEquip.reason : 'Équiper dans le slot sélectionné'}
              className={cn(
                'text-[10px] rounded px-2 py-1 border transition-colors',
                equipped
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                  : !canEquip.ok
                    ? 'border-border/20 bg-card/10 text-muted-foreground/50 cursor-not-allowed'
                    : 'border-foreground/30 bg-foreground/10 text-foreground hover:bg-foreground/20',
              )}
            >{equipped ? '✓ Équipé' : 'Équiper'}</button>
          </li>
        );
      })}
    </ul>
  );
}
