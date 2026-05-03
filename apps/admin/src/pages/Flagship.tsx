import { useGameConfig } from '@/hooks/useGameConfig';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { Ship } from 'lucide-react';
import { FlagshipImagePool } from './flagship/FlagshipImagePool';
import { HullConfigSection } from './flagship/HullConfigSection';

export default function Flagship() {
  const { data, isLoading, refetch } = useGameConfig();

  if (isLoading) return <PageSkeleton />;
  if (!data) return null;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Ship className="w-5 h-5 text-cyan-400" />
        <h1 className="text-lg font-semibold text-gray-100">Flagship</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Pool d'images des coques + configuration des coques.
      </p>

      <FlagshipImagePool />
      <HullConfigSection hulls={data?.hulls ?? {}} onUpdated={refetch} />
    </div>
  );
}
