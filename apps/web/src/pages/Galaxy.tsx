import { useState, useRef, useEffect } from 'react';
import { Link, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/common/Skeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';

export default function Galaxy() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanet = planets?.find((p) => p.id === planetId);

  const [galaxy, setGalaxy] = useState(activePlanet?.galaxy ?? 1);
  const [system, setSystem] = useState(activePlanet?.system ?? 1);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && activePlanet) {
      setGalaxy(activePlanet.galaxy);
      setSystem(activePlanet.system);
      setInitialized(true);
    }
  }, [activePlanet, initialized]);

  const { data, isLoading } = trpc.galaxy.system.useQuery(
    { galaxy, system },
  );
  const { data: gameConfig } = useGameConfig();

  // Touch swipe for system navigation
  const touchStart = useRef<number | null>(null);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(delta) > 50) {
      if (delta > 0) setSystem(Math.max(1, system - 1));
      else setSystem(Math.min(499, system + 1));
    }
    touchStart.current = null;
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Galaxie" />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Galaxie</label>
          <div className="flex items-center gap-1 flex-1 sm:flex-initial">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.max(1, galaxy - 1))}
              disabled={galaxy <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={9}
              value={galaxy}
              onChange={(e) => setGalaxy(Math.max(1, Math.min(9, Number(e.target.value) || 1)))}
              className="w-16 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setGalaxy(Math.min(9, galaxy + 1))}
              disabled={galaxy >= 9}
            >
              &gt;
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Système</label>
          <div className="flex items-center gap-1 flex-1 sm:flex-initial">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.max(1, system - 1))}
              disabled={system <= 1}
            >
              &lt;
            </Button>
            <Input
              type="number"
              min={1}
              max={499}
              value={system}
              onChange={(e) => setSystem(Math.max(1, Math.min(499, Number(e.target.value) || 1)))}
              className="w-20 text-center"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSystem(Math.min(499, system + 1))}
              disabled={system >= 499}
            >
              &gt;
            </Button>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <h2 className="text-base font-semibold mb-4">
          Système solaire [{galaxy}:{system}]
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : (
          <>
            {/* Mobile list */}
            <div
              className="space-y-1 lg:hidden"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              {data?.slots.map((slot, i) => {
                const isBelt = slot && 'type' in slot && (slot as any).type === 'belt';

                if (isBelt) {
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg p-2 bg-orange-500/5 border border-orange-500/20">
                      <span className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
                      <span className="text-sm text-orange-400">Ceinture d&apos;astéroïdes</span>
                    </div>
                  );
                }

                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 rounded-lg p-2 ${!slot ? 'opacity-40' : 'hover:bg-accent/50'}`}
                  >
                    <span className="w-6 text-center text-xs font-mono text-muted-foreground">{i + 1}</span>
                    {slot ? (
                      <>
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{(slot as any).planetName}</span>
                          <div className="text-xs text-muted-foreground">
                            {(slot as any).planetClassId && (
                              <span className="text-primary/70 mr-1">
                                {gameConfig?.planetTypes?.find((t) => t.id === (slot as any).planetClassId)?.name ?? ''}
                              </span>
                            )}
                            {(slot as any).allianceTag && <span className="text-primary mr-1">[{(slot as any).allianceTag}]</span>}
                            {(slot as any).username}
                          </div>
                        </div>
                        {(slot as any).debris && ((slot as any).debris.minerai > 0 || (slot as any).debris.silicium > 0) && (
                          <Link
                            to={`/fleet?mission=recycle&galaxy=${galaxy}&system=${system}&position=${i + 1}`}
                            className="text-xs text-orange-400 hover:underline cursor-pointer"
                            title={`Débris: ${(slot as any).debris.minerai.toLocaleString('fr-FR')} minerai, ${(slot as any).debris.silicium.toLocaleString('fr-FR')} silicium`}
                          >
                            DF
                          </Link>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="h-2 w-2 rounded-full bg-muted" />
                        <span className="text-sm text-muted-foreground">Vide</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden lg:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="px-2 py-1 w-12">Pos</th>
                    <th className="px-2 py-1">Planète</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Joueur</th>
                    <th className="px-2 py-1 w-20">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.slots.map((slot, i) => {
                    const isBelt = slot && 'type' in slot && (slot as any).type === 'belt';

                    if (isBelt) {
                      return (
                        <tr key={i} className="border-b border-orange-500/20 bg-orange-500/5">
                          <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                          <td colSpan={4} className="px-2 py-1 text-sm text-orange-400">
                            Ceinture d&apos;astéroïdes
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={i} className={`border-b border-border/50 ${!slot ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        {slot ? (
                          <>
                            <td className="px-2 py-1">{(slot as any).planetName}</td>
                            <td className="px-2 py-1 text-xs text-muted-foreground">
                              {(slot as any).planetClassId
                                ? gameConfig?.planetTypes?.find((t) => t.id === (slot as any).planetClassId)?.name ?? ''
                                : ''}
                            </td>
                            <td className="px-2 py-1">
                              {(slot as any).allianceTag && <span className="text-xs text-primary mr-1">[{(slot as any).allianceTag}]</span>}
                              {(slot as any).username}
                              {(slot as any).debris && ((slot as any).debris.minerai > 0 || (slot as any).debris.silicium > 0) && (
                                <Link
                                  to={`/fleet?mission=recycle&galaxy=${galaxy}&system=${system}&position=${i + 1}`}
                                  className="text-xs text-orange-400 ml-2 hover:underline cursor-pointer"
                                  title={`Débris: ${(slot as any).debris.minerai.toLocaleString('fr-FR')} minerai, ${(slot as any).debris.silicium.toLocaleString('fr-FR')} silicium`}
                                >
                                  DF
                                </Link>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              <span className="text-xs text-muted-foreground">-</span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1">-</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
