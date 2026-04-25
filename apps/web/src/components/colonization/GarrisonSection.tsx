import { Shield as IconShield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getShipName } from '@/lib/entity-names';
import { ExpandableInfo } from '@/components/common/ExpandableInfo';
import type { ColonizationStatus, GameConfigLike } from './types';

const formatNumber = (n: number) => n.toLocaleString('fr-FR');

interface GarrisonSectionProps {
  status: ColonizationStatus;
  gameConfig: GameConfigLike | null | undefined;
  onSendReinforcements: () => void;
}

export function GarrisonSection({
  status,
  gameConfig,
  onSendReinforcements,
}: GarrisonSectionProps) {
  const garrisonShips = Object.entries(status.stationedShips).filter(([, count]) => count > 0);

  return (
    <section className="rounded-xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-blue-900/5 overflow-hidden">
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
          <IconShield className="w-4 h-4" />
          Garnison
        </h3>
        <span className="text-xs font-bold text-blue-400 tabular-nums">
          {formatNumber(status.stationedFP)} FP
        </span>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[11px] text-muted-foreground leading-tight">
          Les vaisseaux stationnes defendent la colonie contre les raids pirates qui peuvent survenir pendant la colonisation.
        </p>
        {status.garrisonBonusActive ? (
          <p className="mt-1 text-[11px] text-emerald-300">
            Bonus garnison actif : <span className="font-bold">+{(status.garrisonBonusValue * 100).toFixed(0)}%/h</span> tant que la garnison reste au-dessus de {status.garrisonFpThreshold} FP.
          </p>
        ) : (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Atteignez <span className="text-blue-300 font-medium">{status.garrisonFpThreshold} FP</span> stationnes pour debloquer <span className="text-emerald-300 font-medium">+{(status.garrisonBonusValue * 100).toFixed(0)}%/h</span> en continu.
            {status.stationedFP > 0 && (
              <span className="text-muted-foreground"> (actuellement {formatNumber(status.stationedFP)} FP)</span>
            )}
          </p>
        )}
        <div className="mt-1.5">
          <ExpandableInfo label="Role de la garnison" accent="blue">
            <p>
              Votre garnison actuelle : <span className="text-blue-300 font-medium">{formatNumber(status.stationedFP)} FP</span>.
              Elle intercepte les raids pirates a leur arrivee.
            </p>
            <p className="text-emerald-300">
              Bonus garnison : avec au moins <span className="font-bold">{status.garrisonFpThreshold} FP stationnes</span>, la colonisation gagne <span className="font-bold">+{(status.garrisonBonusValue * 100).toFixed(0)}%/h</span> en permanence. Cumulable avec le bonus convoi (plafond +{(status.bonusCap * 100).toFixed(0)}%/h).
            </p>
            <p>
              La taille des raids croit avec le niveau IPC (actuellement <span className="text-foreground font-medium">niv. {status.ipcLevel}</span>) et, dans une moindre mesure, avec votre garnison elle-meme. Maintenez un FP suffisant pour vaincre les raids sans surdimensionner.
            </p>
            <p className="text-muted-foreground">
              Conseil : envoyez des renforts des que vous voyez des menaces en approche. Sans garnison, les raids detruisent vos stocks et peuvent ralentir la colonisation.
            </p>
          </ExpandableInfo>
        </div>
      </div>

      <div className="px-4 pb-3">
        {garrisonShips.length > 0 ? (
          <div className="space-y-1.5">
            {garrisonShips.map(([shipId, count]) => (
              <div
                key={shipId}
                className="flex items-center justify-between rounded-lg bg-card/60 border border-border/20 px-3 py-2"
              >
                <span className="text-xs font-medium text-foreground">
                  {getShipName(shipId, gameConfig)}
                </span>
                <span className="text-xs font-bold text-blue-400 tabular-nums">
                  x{count}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-card/40 border border-border/20 px-3 py-4 text-center">
            <p className="text-xs text-muted-foreground">
              Aucun vaisseau stationné — la colonie est vulnérable aux raids
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-blue-500/10 px-4 py-3">
        <Button
          size="sm"
          variant="ghost"
          className="w-full text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
          onClick={onSendReinforcements}
        >
          <IconShield className="w-4 h-4 mr-2" />
          Envoyer des renforts
        </Button>
      </div>
    </section>
  );
}
