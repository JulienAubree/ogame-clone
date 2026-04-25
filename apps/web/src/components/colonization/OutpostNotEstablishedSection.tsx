import {
  AlertTriangle as IconAlertTriangle,
  Clock as IconClock,
  Send as IconSend,
  Truck as IconTruck,
  Anchor as IconAnchor,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatHoursMinutes } from '@/lib/format';
import { ConvoyCountdown, DeadlineCountdown } from './Countdowns';
import { ExpandableInfo } from '@/components/common/ExpandableInfo';
import type { ColonizationStatus, InboundFleet } from './types';

const formatNumber = (n: number) => n.toLocaleString('fr-FR');

interface OutpostNotEstablishedSectionProps {
  status: ColonizationStatus;
  planetConvoys: InboundFleet[];
  onSendConvoy: () => void;
}

export function OutpostNotEstablishedSection({
  status,
  planetConvoys,
  onSendConvoy,
}: OutpostNotEstablishedSectionProps) {
  return (
    <section className="rounded-xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 to-amber-900/5 p-6 text-center space-y-4">
      <div className="flex justify-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-500/20">
          <IconAnchor className="h-8 w-8 text-amber-400" />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-bold text-foreground mb-1">
          Etablissement de l'avant-poste
        </h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
          Envoyez un premier convoi de ressources pour etablir l'avant-poste
          et demarrer la colonisation.
        </p>
        <div className="mt-3 flex justify-center">
          <ExpandableInfo label="Comment ca marche ?" accent="amber">
            <p>
              Des que le convoi livre au moins <span className="text-minerai font-medium">{formatNumber(status.outpostThresholdMinerai)} minerai</span> et{' '}
              <span className="text-silicium font-medium">{formatNumber(status.outpostThresholdSilicium)} silicium</span>, l'avant-poste est etabli et la colonisation demarre.
            </p>
            <p>
              Progression de base : <span className="font-medium text-foreground">{(status.basePassiveRate * 100).toFixed(0)}%/h</span>
              {' '}× difficulte <span className="font-medium text-foreground">×{status.difficultyFactor.toFixed(2)}</span>
              {' '}= <span className="font-medium text-amber-300">{(status.basePassiveRate * status.difficultyFactor * 100).toFixed(1)}%/h</span> (avec stock suffisant).
            </p>
            <p>
              Temps estime jusqu'a 100% sans rupture : ~<span className="font-medium text-foreground">{formatHoursMinutes(1 / (status.basePassiveRate * status.difficultyFactor))}</span>
              {' '}— reductible jusqu'a ~<span className="font-medium text-emerald-300">{formatHoursMinutes(1 / (status.basePassiveRate * status.difficultyFactor + status.bonusCap))}</span> avec les bonus actifs.
            </p>
            <p className="text-emerald-300">
              Bonus cumulables (plafond +{(status.bonusCap * 100).toFixed(0)}%/h) : stationner au moins <span className="font-medium">{status.garrisonFpThreshold} FP</span> (+{(status.garrisonBonusValue * 100).toFixed(0)}%/h) et livrer regulierement des ressources (+{(status.convoyBonusValue * 100).toFixed(0)}%/h pendant {status.convoyWindowHours}h apres chaque convoi).
            </p>
            <p className="text-muted-foreground">
              Apres livraison : 1h de sursis sans consommation, puis la planete consomme{' '}
              <span className="text-minerai">{formatNumber(status.consumptionMineraiPerHour)} minerai/h</span> et{' '}
              <span className="text-silicium">{formatNumber(status.consumptionSiliciumPerHour)} silicium/h</span>. Rupture = progression divisee par 2.
            </p>
          </ExpandableInfo>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 text-sm">
        <span className="rounded-lg bg-card/80 border border-border/30 px-3 py-1.5 text-minerai font-medium">
          {formatNumber(status.outpostThresholdMinerai)} minerai
        </span>
        <span className="text-muted-foreground">+</span>
        <span className="rounded-lg bg-card/80 border border-border/30 px-3 py-1.5 text-silicium font-medium">
          {formatNumber(status.outpostThresholdSilicium)} silicium
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground">Minimum requis pour etablir l'avant-poste</p>

      {status.outpostTimeoutAt && (
        <div className="mx-auto max-w-sm rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-left">
            <IconAlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="text-[11px] text-red-300 leading-tight">
              Sans avant-poste, la colonie sera abandonnee dans
            </span>
          </div>
          <DeadlineCountdown target={new Date(status.outpostTimeoutAt)} tone="warn" />
        </div>
      )}

      <Button
        className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20"
        onClick={onSendConvoy}
      >
        <IconSend className="w-4 h-4 mr-2" />
        Envoyer un convoi
      </Button>

      {planetConvoys.length > 0 && (
        <div className="mx-auto max-w-md rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-left space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <IconTruck className="w-3.5 h-3.5" />
              Convois en approche
            </p>
            <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
              {planetConvoys.length}
            </span>
          </div>
          <div className="space-y-1.5">
            {planetConvoys.map((f) => {
              const minerai = Number(f.mineraiCargo ?? 0);
              const silicium = Number(f.siliciumCargo ?? 0);
              const hydrogene = Number(f.hydrogeneCargo ?? 0);
              const shipCount = Object.values(f.ships).reduce((a, b) => a + b, 0);
              const missionLabel =
                f.mission === 'colonize_reinforce' ? 'Renforts' :
                f.mission === 'colonize_supply' ? 'Ravitaillement' :
                'Transport';
              return (
                <div
                  key={f.id}
                  className="rounded-md bg-card/60 border border-border/20 px-2.5 py-2 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-emerald-300">{missionLabel}</span>
                      {f.originPlanetName && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          · de {f.originPlanetName}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] tabular-nums mt-0.5">
                      {minerai > 0 && <span className="text-minerai">{formatNumber(minerai)} minerai</span>}
                      {silicium > 0 && <span className="text-silicium">{formatNumber(silicium)} silicium</span>}
                      {hydrogene > 0 && <span className="text-hydrogene">{formatNumber(hydrogene)} hydrogène</span>}
                      {minerai === 0 && silicium === 0 && hydrogene === 0 && shipCount > 0 && (
                        <span className="text-muted-foreground">{shipCount} vaisseau{shipCount > 1 ? 'x' : ''}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <IconClock className="w-3.5 h-3.5 text-emerald-400/60" />
                    <ConvoyCountdown arrivalTime={f.arrivalTime} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-md rounded-lg border border-border/30 bg-card/40 p-3 text-left space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Phases de la colonisation
        </p>
        <ol className="text-[11px] text-muted-foreground leading-relaxed space-y-1 list-decimal list-inside">
          <li>Livrer les ressources minimales pour etablir l'avant-poste.</li>
          <li>Sursis d'installation : pas de consommation pendant la 1re heure.</li>
          <li>Progression passive, consommation active, raids possibles.</li>
          <li>A 100 %, prendre possession de la colonie.</li>
        </ol>
      </div>
    </section>
  );
}
