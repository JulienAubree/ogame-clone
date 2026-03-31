import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { EmpireKpiBar } from '@/components/empire/EmpireKpiBar';
import { EmpirePlanetCard } from '@/components/empire/EmpirePlanetCard';
import { EmpirePlanetRow } from '@/components/empire/EmpirePlanetRow';

export default function Empire() {
  const { data, isLoading } = trpc.planet.empire.useQuery();

  if (isLoading || !data) {
    return (
      <div className="space-y-4 p-4 lg:p-6">
        <PageHeader title="Empire" description="Vue d'ensemble de vos colonies" />
        <CardGridSkeleton count={4} />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 lg:p-6">
      <PageHeader title="Empire" description="Vue d'ensemble de vos colonies" />

      <EmpireKpiBar
        totalRates={data.totalRates}
        planetCount={data.planets.length}
        activeFleetCount={data.activeFleetCount}
        inboundAttackCount={data.inboundAttackCount}
      />

      {/* Desktop grid */}
      <div className="hidden lg:grid lg:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] lg:gap-4">
        {data.planets.map((planet, i) => (
          <EmpirePlanetCard key={planet.id} planet={planet} isFirst={i === 0} />
        ))}
      </div>

      {/* Mobile list */}
      <div className="lg:hidden">
        {data.planets.map((planet, i) => (
          <EmpirePlanetRow
            key={planet.id}
            planet={planet}
            isFirst={i === 0}
            isLast={i === data.planets.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
