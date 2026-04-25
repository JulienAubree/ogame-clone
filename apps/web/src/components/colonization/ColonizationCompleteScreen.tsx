import { CheckCircle as IconCheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getPlanetImageUrl } from '@/lib/assets';
import type { ColonizationStatus, PlanetSummary, PlanetCoords } from './types';

interface ColonizationCompleteScreenProps {
  status: ColonizationStatus;
  planet: PlanetSummary | undefined;
  coords: PlanetCoords | null;
  onComplete: () => void;
  isPending: boolean;
}

export function ColonizationCompleteScreen({
  status,
  planet,
  coords,
  onComplete,
  isPending,
}: ColonizationCompleteScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-12 lg:py-20 text-center">
      {/* Planet image */}
      {planet?.planetClassId && planet.planetImageIndex != null && (
        <div className="relative mb-6">
          <img
            src={getPlanetImageUrl(planet.planetClassId, planet.planetImageIndex, 'full')}
            alt={planet.name}
            className="h-40 w-40 lg:h-52 lg:w-52 rounded-full border-4 border-emerald-500/40 object-cover shadow-2xl shadow-emerald-500/30"
          />
          <div className="absolute -bottom-2 -right-2 rounded-full bg-emerald-500 p-2.5 shadow-lg">
            <IconCheckCircle className="h-6 w-6 text-white" />
          </div>
        </div>
      )}

      {/* Title */}
      <h1 className="text-3xl lg:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-emerald-300 to-emerald-600 mb-2">
        Colonisation reussie !
      </h1>
      <p className="text-lg text-foreground font-semibold mb-1">
        {planet?.name ?? 'Colonie'} [{coords?.galaxy}:{coords?.system}:{coords?.position}]
      </p>
      <p className="text-sm text-muted-foreground mb-8 max-w-md">
        Votre colonie est stabilisee et operationnelle. Les infrastructures sont en place,
        le perimetre est securise. Un nouveau monde vous attend.
      </p>

      {/* Summary */}
      <div className="flex items-center gap-6 mb-8 text-sm">
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-400">100%</div>
          <div className="text-xs text-muted-foreground">Progression</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div className="text-center">
          <div className="text-2xl font-bold text-amber-400">x{status.difficultyFactor.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Difficulte</div>
        </div>
        <div className="h-8 w-px bg-border/50" />
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-400">{status.stationedFP}</div>
          <div className="text-xs text-muted-foreground">FP garnison</div>
        </div>
      </div>

      {/* CTA */}
      <Button
        size="lg"
        className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20 text-base px-8"
        onClick={onComplete}
        disabled={isPending}
      >
        {isPending ? 'Finalisation...' : 'Prendre possession de la colonie'}
      </Button>
    </div>
  );
}
