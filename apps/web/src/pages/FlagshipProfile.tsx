import { useState, useMemo, useCallback } from 'react';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { TalentTree } from '@/components/flagship/TalentTree';
import { HullChangeModal } from '@/components/flagship/HullChangeModal';
import { IncapacitatedBanner } from '@/components/flagship/IncapacitatedBanner';
import { HullRefitBanner } from '@/components/flagship/HullRefitBanner';
import { HullAbilitiesPanel } from '@/components/flagship/HullAbilitiesPanel';
import { FlagshipIdentityCard } from '@/components/flagship/FlagshipIdentityCard';
import { FlagshipStatsCard } from '@/components/flagship/FlagshipStatsCard';
import { FlagshipImagePicker } from '@/components/flagship/FlagshipImagePicker';
import { FlagshipSkeleton } from '@/components/flagship/FlagshipSkeleton';

interface PlanetLite {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId?: string | null;
  planetImageIndex?: number | null;
}

export default function FlagshipProfile() {
  const utils = trpc.useUtils();
  const { data: flagship, isLoading } = trpc.flagship.get.useQuery();
  const { data: flagshipImages } = trpc.flagship.listImages.useQuery(
    { hullId: (flagship?.hullId ?? 'industrial') as 'combat' | 'industrial' | 'scientific' },
    { enabled: !!flagship },
  );
  const { data: talentTree } = trpc.talent.list.useQuery();
  const { data: exiliumData } = trpc.exilium.getBalance.useQuery();
  const { data: planets } = trpc.planet.list.useQuery();
  const balance = exiliumData?.balance ?? 0;

  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showHullChange, setShowHullChange] = useState(false);

  const imageMutation = trpc.flagship.updateImage.useMutation({
    onSuccess: () => utils.flagship.get.invalidate(),
  });

  const handleRepaired = useCallback(() => {
    utils.flagship.get.invalidate();
  }, [utils.flagship.get]);

  const totalTalentPoints = useMemo(() => {
    if (!talentTree) return 0;
    return Object.values(talentTree.ranks).reduce((sum, r) => sum + r, 0);
  }, [talentTree]);

  // Find planet where flagship is stationed
  const stationedPlanet = useMemo<PlanetLite | null>(() => {
    if (!flagship || !planets) return null;
    return (planets as PlanetLite[]).find((p) => p.id === flagship.planetId) ?? null;
  }, [flagship, planets]);

  if (isLoading) return <FlagshipSkeleton />;

  if (!flagship) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Vaisseau amiral" />
        <div className="glass-card p-8 text-center">
          <p className="text-muted-foreground">Vous n'avez pas encore de vaisseau amiral.</p>
        </div>
      </div>
    );
  }

  const isIncapacitated = flagship.status === 'incapacitated' && flagship.repairEndsAt;
  const isHullRefit = flagship.status === 'hull_refit' && (flagship as { refitEndsAt?: string | Date }).refitEndsAt;

  const effectiveStats = 'effectiveStats' in flagship
    ? (flagship as { effectiveStats: Record<string, number | string> | null }).effectiveStats
    : null;
  const talentBonuses = 'talentBonuses' in flagship
    ? (flagship as { talentBonuses: Record<string, number> }).talentBonuses
    : {};
  const hullConfig = 'hullConfig' in flagship
    ? (flagship as { hullConfig: { id: string; name: string; description: string } | null }).hullConfig
    : null;
  const driveType = (effectiveStats?.driveType as string | undefined) ?? flagship.driveType;

  function handleImageSelect(imageIndex: number) {
    imageMutation.mutate({ imageIndex });
    setShowImagePicker(false);
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Vaisseau amiral" />

      {isIncapacitated && (
        <IncapacitatedBanner
          name={flagship.name}
          repairEndsAt={new Date(flagship.repairEndsAt!)}
          flagshipImageIndex={flagship.flagshipImageIndex}
          hullId={flagship.hullId ?? 'industrial'}
          onRepaired={handleRepaired}
          balance={balance}
        />
      )}

      {isHullRefit && (
        <HullRefitBanner
          name={flagship.name}
          refitEndsAt={new Date((flagship as { refitEndsAt: string | Date }).refitEndsAt)}
          onComplete={handleRepaired}
        />
      )}

      <FlagshipIdentityCard
        flagship={flagship}
        hullConfig={hullConfig}
        flagshipImages={flagshipImages}
        stationedPlanet={stationedPlanet}
        balance={balance}
        totalTalentPoints={totalTalentPoints}
        onOpenImagePicker={() => setShowImagePicker(true)}
        onOpenHullChange={() => setShowHullChange(true)}
      />

      {hullConfig && (
        <HullAbilitiesPanel
          flagship={flagship}
          hullConfig={hullConfig}
          hullId={flagship.hullId ?? 'industrial'}
        />
      )}

      <FlagshipStatsCard
        flagship={flagship}
        effectiveStats={effectiveStats as Parameters<typeof FlagshipStatsCard>[0]['effectiveStats']}
        talentBonuses={talentBonuses}
        driveType={driveType}
      />

      <TalentTree showGuide />

      <FlagshipImagePicker
        open={showImagePicker}
        hullId={flagship.hullId ?? 'industrial'}
        currentImageIndex={flagship.flagshipImageIndex}
        images={flagshipImages ?? []}
        onSelect={handleImageSelect}
        onClose={() => setShowImagePicker(false)}
      />

      <HullChangeModal
        open={showHullChange}
        onClose={() => setShowHullChange(false)}
        flagship={flagship}
      />
    </div>
  );
}
