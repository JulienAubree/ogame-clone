import { useState, useRef, useEffect } from 'react';
import { Building2, HelpCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FlagshipIcon } from '@/lib/icons';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon, EnergieIcon } from '@/components/common/ResourceIcons';
import { getPlanetImageUrl } from '@/lib/assets';
import { EntityDetailOverlay } from '@/components/common/EntityDetailOverlay';
import { HeroAtmosphere } from '@/components/common/HeroAtmosphere';
import { AbandonColonyModal, type AbandonModalPlanet } from '@/components/empire/AbandonColonyModal';
import { trpc } from '@/trpc';

// Reuse BiomeBadge from existing Overview — it will be extracted in the main page rewrite
// For now, accept biomes as render prop or inline

interface GovernanceData {
  colonyCount: number;
  capacity: number;
  overextend: number;
  harvestMalus: number;
  constructionMalus: number;
}

interface OverviewHeroPlanet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  diameter: number;
  minTemp: number;
  maxTemp: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  renamed: boolean;
  biomes?: Array<{ id: string; name: string; rarity: string; effects?: Array<{ stat: string; modifier: number }> }>;
}

type OverviewHeroBiome = NonNullable<OverviewHeroPlanet['biomes']>[number];

interface OverviewHeroProps {
  planet: OverviewHeroPlanet;
  flagshipOnPlanet: boolean;
  planetTypeName?: string;
  planetTypeBonus?: { mineraiBonus: number; siliciumBonus: number; hydrogeneBonus: number };
  governance?: GovernanceData | null;
  allPlanets: AbandonModalPlanet[];
  renderBiomeBadge: (biome: OverviewHeroBiome) => React.ReactNode;
  renderPlanetDetail: (planet: OverviewHeroPlanet) => React.ReactNode;
}

export function OverviewHero({ planet, flagshipOnPlanet, planetTypeName, planetTypeBonus, governance, allPlanets, renderBiomeBadge, renderPlanetDetail }: OverviewHeroProps) {
  const utils = trpc.useUtils();
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isHomeworld = planet.planetClassId === 'homeworld';
  const canAbandon = !isHomeworld;
  const canRename = !planet.renamed;
  const hasMenu = canRename || canAbandon;

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  const renameMutation = trpc.planet.rename.useMutation({
    onSuccess: () => {
      utils.planet.list.invalidate();
      setIsRenaming(false);
    },
  });

  const biomes = planet.biomes ?? [];

  // Cumulate type + biome bonuses per resource
  const cumulatedBonuses: Record<string, number> = {};
  if (planetTypeBonus) {
    if (planetTypeBonus.mineraiBonus !== 1) cumulatedBonuses['minerai'] = (planetTypeBonus.mineraiBonus - 1);
    if (planetTypeBonus.siliciumBonus !== 1) cumulatedBonuses['silicium'] = (planetTypeBonus.siliciumBonus - 1);
    if (planetTypeBonus.hydrogeneBonus !== 1) cumulatedBonuses['hydrogene'] = (planetTypeBonus.hydrogeneBonus - 1);
  }
  const biomeStat2Resource: Record<string, string> = {
    production_minerai: 'minerai', production_silicium: 'silicium', production_hydrogene: 'hydrogene',
    energy_production: 'energy',
  };
  for (const biome of biomes) {
    for (const e of biome.effects ?? []) {
      const key = biomeStat2Resource[e.stat];
      if (key) cumulatedBonuses[key] = (cumulatedBonuses[key] ?? 0) + e.modifier;
    }
  }
  // Apply governance harvest malus to resource bonuses
  if (governance && governance.harvestMalus > 0) {
    for (const key of ['minerai', 'silicium', 'hydrogene']) {
      cumulatedBonuses[key] = (cumulatedBonuses[key] ?? 0) - governance.harvestMalus;
    }
  }
  const hasBonuses = Object.keys(cumulatedBonuses).length > 0;

  const planetImageUrl =
    planet.planetClassId && planet.planetImageIndex != null
      ? getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex)
      : null;

  return (
    <>
      <div className="relative overflow-hidden">
        <HeroAtmosphere imageUrl={planetImageUrl} variant="cyan-purple" />

        {/* Actions menu (top-right) */}
        {hasMenu && (
          <div ref={menuRef} className="absolute right-3 top-3 z-20 lg:right-4 lg:top-4">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex h-8 w-8 items-center justify-center rounded-md bg-background/40 text-muted-foreground backdrop-blur-sm transition-colors hover:bg-background/70 hover:text-foreground"
            >
              <span className="text-base leading-none">{'⋯'}</span>
            </button>
            {menuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-30 mt-1 min-w-48 rounded-md border border-white/10 bg-card/95 backdrop-blur-lg shadow-lg animate-slide-up"
              >
                {canRename && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setNewName(planet.name);
                      setIsRenaming(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent"
                  >
                    Renommer la colonie
                  </button>
                )}
                {canAbandon && (
                  <button
                    role="menuitem"
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      setAbandonOpen(true);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
                  >
                    Abandonner la colonie
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="relative px-5 pt-8 pb-6 lg:px-8 lg:pt-10 lg:pb-8">
          <div className="flex items-start gap-5">
            {/* Thumbnail — clickable for detail overlay */}
            <button
              type="button"
              onClick={() => setShowDetail(true)}
              className="relative group shrink-0"
              title="Voir les détails de la planète"
            >
              {planet.planetClassId && planet.planetImageIndex != null ? (
                <img
                  src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'thumb')}
                  alt={planet.name}
                  className="h-20 w-20 lg:h-24 lg:w-24 rounded-full border-2 border-primary/30 object-cover shadow-lg shadow-primary/10 transition-opacity group-hover:opacity-80"
                />
              ) : (
                <div className="flex h-20 w-20 lg:h-24 lg:w-24 items-center justify-center rounded-full border-2 border-primary/30 bg-card text-2xl font-bold text-primary shadow-lg shadow-primary/10">
                  {planet.name.charAt(0)}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                <HelpCircle className="h-5 w-5 text-white" />
              </div>
            </button>

            {/* Title + info */}
            <div className="flex-1 min-w-0 pt-1">
              {isRenaming ? (
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newName.trim()) renameMutation.mutate({ planetId: planet.id, name: newName.trim() });
                  }}
                >
                  <Input autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={30} className="h-7 text-sm" />
                  <Button type="submit" size="sm" disabled={renameMutation.isPending}>OK</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setIsRenaming(false)}>Annuler</Button>
                </form>
              ) : (
                <h1
                  className={`text-xl lg:text-2xl font-bold text-foreground truncate ${!planet.renamed ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
                  onClick={!planet.renamed ? () => { setNewName(planet.name); setIsRenaming(true); } : undefined}
                  title={!planet.renamed ? 'Cliquer pour renommer' : undefined}
                >
                  {planet.name}
                  {flagshipOnPlanet && (
                    <FlagshipIcon width={16} height={16} className="inline-block ml-2 text-energy align-text-bottom" />
                  )}
                </h1>
              )}
              <p className="text-sm text-muted-foreground mt-0.5">
                [{planet.galaxy}:{planet.system}:{planet.position}]
                {planetTypeName && <> · <span className="text-foreground/80">{planetTypeName}</span></>}
              </p>
              {/* Cumulated bonuses (type + biomes) with resource icons */}
              {hasBonuses && (
                <div className="flex items-center gap-3 mt-1.5">
                  {cumulatedBonuses['minerai'] != null && (() => {
                    const pct = Math.round(cumulatedBonuses['minerai'] * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <MineraiIcon size={13} className="text-minerai" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {cumulatedBonuses['silicium'] != null && (() => {
                    const pct = Math.round(cumulatedBonuses['silicium'] * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <SiliciumIcon size={13} className="text-silicium" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {cumulatedBonuses['hydrogene'] != null && (() => {
                    const pct = Math.round(cumulatedBonuses['hydrogene'] * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <HydrogeneIcon size={13} className="text-hydrogene" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {cumulatedBonuses['energy'] != null && (() => {
                    const pct = Math.round(cumulatedBonuses['energy'] * 100);
                    return (
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold ${pct > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        <EnergieIcon size={13} className="text-energy" />
                        {pct > 0 ? '+' : ''}{pct}%
                      </span>
                    );
                  })()}
                  {governance && governance.harvestMalus > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-400 bg-amber-400/10 rounded px-1.5 py-0.5">
                      <Building2 className="h-[13px] w-[13px]" strokeWidth={2} />
                      -{Math.round(governance.harvestMalus * 100)}%
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Biomes */}
          {biomes.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-4">
              {biomes.map((biome) => (
                <span key={biome.id}>{renderBiomeBadge(biome)}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Planet detail overlay */}
      <EntityDetailOverlay open={showDetail} onClose={() => setShowDetail(false)} title={planet.name}>
        {renderPlanetDetail(planet)}
      </EntityDetailOverlay>

      {canAbandon && (
        <AbandonColonyModal
          planet={{
            id: planet.id,
            name: planet.name,
            galaxy: planet.galaxy,
            system: planet.system,
            position: planet.position,
            planetClassId: planet.planetClassId,
            status: 'active',
          }}
          allPlanets={allPlanets}
          open={abandonOpen}
          onOpenChange={setAbandonOpen}
        />
      )}
    </>
  );
}
