import { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/common/Skeleton';
import { CoordinateInput } from '@/components/common/CoordinateInput';
import { PageHeader } from '@/components/common/PageHeader';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetDot } from '@/components/galaxy/PlanetDot';
import { AsteroidBelt } from '@/components/galaxy/AsteroidBelt';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';

export default function Galaxy() {
  const { planetId } = useOutletContext<{ planetId?: string }>();
  const { data: planets } = trpc.planet.list.useQuery();
  const activePlanet = planets?.find((p) => p.id === planetId);
  const { data: ships } = trpc.shipyard.ships.useQuery(
    { planetId: planetId! },
    { enabled: !!planetId },
  );

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

  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.user);
  const openChat = useChatStore((s) => s.openChat);
  const { data, isLoading } = trpc.galaxy.system.useQuery(
    { galaxy, system },
  );
  const { data: gameConfig } = useGameConfig();
  const { data: myAlliance } = trpc.alliance.myAlliance.useQuery();
  const { data: pveData } = trpc.pve.getMissions.useQuery();

  const colonizerShipId = useMemo(() => {
    if (!gameConfig?.ships) return null;
    const entry = Object.entries(gameConfig.ships).find(([, s]) => (s as any).role === 'colonization');
    return entry?.[0] ?? null;
  }, [gameConfig?.ships]);
  const hasColonizer = !!(colonizerShipId && ships?.find((s) => s.id === colonizerShipId && s.count > 0));

  // Map position → mission for current galaxy:system
  const missionByPosition = useMemo(() => {
    const map = new Map<number, { id: string }>();
    if (!pveData?.missions) return map;
    for (const m of pveData.missions) {
      const p = m.parameters as { galaxy?: number; system?: number; position?: number };
      if (p.galaxy === galaxy && p.system === system && p.position) {
        map.set(p.position, { id: m.id });
      }
    }
    return map;
  }, [pveData?.missions, galaxy, system]);

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

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setSystem(Math.max(1, system - 1))}
          disabled={system <= 1}
        >
          &lt;
        </Button>
        <CoordinateInput
          galaxy={galaxy}
          system={system}
          position={1}
          onChange={(c) => { setGalaxy(c.galaxy); setSystem(c.system); }}
          hidePosition
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
                const isOtherPlayer = slot && !isBelt && (slot as any).userId && (slot as any).userId !== currentUser?.id;
                const isSameAlliance = isOtherPlayer && myAlliance && (slot as any).allianceId && (slot as any).allianceId === myAlliance.id;
                const canAttack = isOtherPlayer && !isSameAlliance;

                if (isBelt) {
                  const beltMission = missionByPosition.get(i + 1);
                  return (
                    <div key={i} className="group relative flex items-center gap-3 rounded-lg px-2 h-10 overflow-hidden border border-orange-500/15 bg-black/20">
                      <AsteroidBelt className="absolute inset-0 w-full h-full" />
                      <span className="relative z-10 w-6 text-center text-xs font-mono text-orange-400/70">{i + 1}</span>
                      <span className="relative z-10 flex-1 text-sm text-orange-300/80 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Ceinture d&apos;astéroïdes</span>
                      {beltMission && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="relative z-10 text-xs h-6 px-2 border-orange-500/40 text-orange-400 hover:bg-orange-500/20 backdrop-blur-sm"
                          onClick={() => navigate(`/fleet/send?mission=mine&galaxy=${galaxy}&system=${system}&position=${i + 1}&pveMissionId=${beltMission.id}`)}
                        >
                          Miner
                        </Button>
                      )}
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
                        <PlanetDot planetClassId={(slot as any).planetClassId} size={20} />
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
                        <div className="flex items-center gap-1 ml-auto">
                          {isOtherPlayer && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-xs h-6 px-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                                onClick={() => navigate(`/fleet/send?mission=spy&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                              >
                                Espionner
                              </Button>
                              {canAttack && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6 px-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                  onClick={() => navigate(`/fleet/send?mission=attack&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                                >
                                  Attaquer
                                </Button>
                              )}
                            </>
                          )}
                          {(slot as any).debris && ((slot as any).debris.minerai > 0 || (slot as any).debris.silicium > 0) && (
                            <Link
                              to={`/fleet/send?mission=recycle&galaxy=${galaxy}&system=${system}&position=${i + 1}`}
                              className="text-xs text-orange-400 hover:underline cursor-pointer"
                              title={`Débris: ${(slot as any).debris.minerai.toLocaleString('fr-FR')} minerai, ${(slot as any).debris.silicium.toLocaleString('fr-FR')} silicium`}
                            >
                              DF
                            </Link>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="h-5 w-5 rounded-full bg-muted/30" />
                        <span className="flex-1 text-sm text-muted-foreground">Vide</span>
                        {hasColonizer && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs h-6 px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                            onClick={() => navigate(`/fleet/send?mission=colonize&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                          >
                            Coloniser
                          </Button>
                        )}
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
                    const isOtherPlayer2 = slot && !isBelt && (slot as any).userId && (slot as any).userId !== currentUser?.id;
                    const isSameAlliance2 = isOtherPlayer2 && myAlliance && (slot as any).allianceId && (slot as any).allianceId === myAlliance.id;
                    const canAttack2 = isOtherPlayer2 && !isSameAlliance2;

                    if (isBelt) {
                      const beltMission = missionByPosition.get(i + 1);
                      return (
                        <tr key={i} className="border-b border-orange-500/10">
                          <td className="px-2 py-1 text-orange-400/70 relative z-10">{i + 1}</td>
                          <td colSpan={3} className="px-2 py-0 relative overflow-hidden">
                            <div className="relative h-9 flex items-center rounded bg-black/20">
                              <AsteroidBelt className="absolute inset-0 w-full h-full" />
                              <span className="relative z-10 pl-2 text-sm text-orange-300/80 tracking-wide drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">Ceinture d&apos;astéroïdes</span>
                            </div>
                          </td>
                          <td className="px-2 py-1">
                            {beltMission && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-6 px-2 border-orange-500/40 text-orange-400 hover:bg-orange-500/20 backdrop-blur-sm"
                                onClick={() => navigate(`/fleet/send?mission=mine&galaxy=${galaxy}&system=${system}&position=${i + 1}&pveMissionId=${beltMission.id}`)}
                              >
                                Miner
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    return (
                      <tr key={i} className={`border-b border-border/50 ${!slot ? 'opacity-40' : ''}`}>
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        {slot ? (
                          <>
                            <td className="px-2 py-1">
                              <span className="inline-flex items-center gap-2">
                                <PlanetDot planetClassId={(slot as any).planetClassId} size={18} />
                                {(slot as any).planetName}
                              </span>
                            </td>
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
                                  to={`/fleet/send?mission=recycle&galaxy=${galaxy}&system=${system}&position=${i + 1}`}
                                  className="text-xs text-orange-400 ml-2 hover:underline cursor-pointer"
                                  title={`Débris: ${(slot as any).debris.minerai.toLocaleString('fr-FR')} minerai, ${(slot as any).debris.silicium.toLocaleString('fr-FR')} silicium`}
                                >
                                  DF
                                </Link>
                              )}
                            </td>
                            <td className="px-2 py-1">
                              {isOtherPlayer2 && (
                                <div className="flex items-center gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs h-6 px-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20"
                                    onClick={() => navigate(`/fleet/send?mission=spy&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                                    title="Espionner"
                                  >
                                    Espionner
                                  </Button>
                                  {canAttack2 && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs h-6 px-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20"
                                      onClick={() => navigate(`/fleet/send?mission=attack&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                                      title="Attaquer"
                                    >
                                      Attaquer
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-xs h-6 px-1.5"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openChat((slot as any).userId, (slot as any).username);
                                    }}
                                    title="Message"
                                  >
                                    Message
                                  </Button>
                                </div>
                              )}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1 text-muted-foreground">-</td>
                            <td className="px-2 py-1">
                              {hasColonizer && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-xs h-6 px-1.5 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/20"
                                  onClick={() => navigate(`/fleet/send?mission=colonize&galaxy=${galaxy}&system=${system}&position=${i + 1}`)}
                                  title="Coloniser"
                                >
                                  Coloniser
                                </Button>
                              )}
                            </td>
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
