import { Trophy, Sparkles, Heart, Shield, Hammer, Zap, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';
import { cn } from '@/lib/utils';

type BossBuff =
  | 'damage_boost'
  | 'hull_repair'
  | 'shield_amp'
  | 'armor_amp'
  | 'extra_charge'
  | 'module_unlock';

const BUFF_LABELS: Record<BossBuff, string> = {
  damage_boost:  'Surcharge offensive',
  hull_repair:   'Réparation héroïque',
  shield_amp:    'Bouclier renforcé',
  armor_amp:     'Blindage renforcé',
  extra_charge:  'Charge épique additionnelle',
  module_unlock: 'Batterie improvisée',
};

const BUFF_DESC: Record<BossBuff, (m: number) => string> = {
  damage_boost:  (m) => `+${Math.round(m * 100)}% dégâts flagship pour le reste de la run`,
  hull_repair:   (m) => `Restaure +${Math.round(m * 100)}% de coque + 1 charge de réparation`,
  shield_amp:    (m) => `+${Math.round(m * 100)}% bouclier flagship pour le reste de la run`,
  armor_amp:     (m) => `+${Math.round(m * 100)}% blindage flagship pour le reste de la run`,
  extra_charge:  (m) => `+${Math.floor(m)} charge épique max & courante`,
  module_unlock: ()  => 'Débloque temporairement +1 batterie weapon flagship',
};

const BUFF_ICONS: Record<BossBuff, React.ComponentType<{ className?: string }>> = {
  damage_boost:  Hammer,
  hull_repair:   Heart,
  shield_amp:    Shield,
  armor_amp:     Shield,
  extra_charge:  Zap,
  module_unlock: Plus,
};

const BUFF_TONES: Record<BossBuff, string> = {
  damage_boost:  'border-rose-500/40 hover:bg-rose-950/40 hover:border-rose-400/70 text-rose-100',
  hull_repair:   'border-emerald-500/40 hover:bg-emerald-950/40 hover:border-emerald-400/70 text-emerald-100',
  shield_amp:    'border-sky-500/40 hover:bg-sky-950/40 hover:border-sky-400/70 text-sky-100',
  armor_amp:     'border-amber-500/40 hover:bg-amber-950/40 hover:border-amber-400/70 text-amber-100',
  extra_charge:  'border-violet-500/40 hover:bg-violet-950/40 hover:border-violet-400/70 text-violet-100',
  module_unlock: 'border-orange-500/40 hover:bg-orange-950/40 hover:border-orange-400/70 text-orange-100',
};

interface BuffChoice {
  type: BossBuff;
  magnitude: number;
}

interface Props {
  open: boolean;
  /** Boss vaincu (info pour le header). */
  boss: { id: string; name: string; title: string } | null;
  /** Choix de buffs proposés. */
  buffChoices: BuffChoice[];
  onClose: () => void;
}

/**
 * Modal affichée après la victoire sur un boss. Le joueur choisit 1 buff
 * parmi 2-3 propositions. Le buff est persisté côté serveur via
 * trpc.anomaly.applyBossBuff et reste actif jusqu'à la fin de la run
 * (cumulable avec les buffs des autres boss).
 *
 * V9 Boss : non-fermable tant que le joueur n'a pas choisi (un buff est
 * une récompense méritée — ne pas autoriser le skip accidentel).
 */
export function AnomalyBossVictoryModal({ open, boss, buffChoices, onClose }: Props) {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const applyMutation = trpc.anomaly.applyBossBuff.useMutation({
    onSuccess: (data) => {
      utils.anomaly.current.invalidate();
      utils.flagship.get.invalidate();
      addToast(
        `Récompense activée : ${BUFF_LABELS[data.appliedBuff.type]}`,
        'success',
      );
      onClose();
    },
    onError: (err) => {
      addToast(err.message ?? 'Application du buff impossible', 'error');
    },
  });

  if (!open || !boss) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-xl border border-amber-500/40 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 shadow-[0_0_40px_rgba(251,191,36,0.18)] overflow-hidden">
        {/* Header victoire */}
        <div className="px-5 py-4 border-b border-amber-500/25 bg-gradient-to-r from-amber-950/40 via-transparent to-amber-950/40">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amber-500/40 bg-amber-950/50 shadow-[0_0_16px_rgba(251,191,36,0.25)]">
              <Trophy className="h-5 w-5 text-amber-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.22em] font-mono font-semibold text-amber-300/85">
                Boss vaincu
              </div>
              <h2 className="text-lg font-bold text-amber-100 tracking-tight truncate">
                {boss.name}
              </h2>
              {boss.title && (
                <p className="text-xs text-amber-200/70 italic truncate">{boss.title}</p>
              )}
            </div>
          </div>
        </div>

        {/* Choix */}
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] font-mono font-semibold text-amber-200/85">
            <Sparkles className="h-3 w-3" />
            Choisis ta récompense
          </div>
          <div className="space-y-2">
            {buffChoices.map((c) => {
              const Icon = BUFF_ICONS[c.type] ?? Sparkles;
              return (
                <button
                  key={c.type}
                  type="button"
                  disabled={applyMutation.isPending}
                  onClick={() => applyMutation.mutate({ buffType: c.type })}
                  className={cn(
                    'w-full text-left rounded-lg border bg-slate-900/40 p-3 transition-colors',
                    'flex items-start gap-3 group',
                    BUFF_TONES[c.type],
                    applyMutation.isPending && 'opacity-50 cursor-not-allowed',
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-current/30 bg-current/10">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold tracking-tight">
                      {BUFF_LABELS[c.type]}
                    </div>
                    <p className="text-xs opacity-80 leading-relaxed mt-0.5">
                      {BUFF_DESC[c.type](c.magnitude)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/30 bg-slate-950/60 flex items-center justify-between gap-2">
          <span className="text-[10px] text-muted-foreground/70 font-mono uppercase tracking-wider">
            Récompense permanente jusqu'à la fin de la run
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={applyMutation.isPending}
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            Plus tard
          </Button>
        </div>
      </div>
    </div>
  );
}
