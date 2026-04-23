import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Blason } from '@exilium/shared';
import { trpc } from '@/trpc';
import { AllianceBlason } from './AllianceBlason';
import { AllianceHeroKebab } from './AllianceHeroKebab';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface AllianceHeroProps {
  alliance: {
    id: string;
    name: string;
    tag: string;
    motto: string | null;
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    myRole: string;
    createdAt: string;
    members: unknown[];
    totalPoints: number;
    rank: number;
    recentMilitary: { wins: number; losses: number; windowDays: number };
  };
}

function formatFounded(createdAt: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(new Date(createdAt));
}

export function AllianceHero({ alliance }: AllianceHeroProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  const blason: Blason = {
    shape: alliance.blasonShape as Blason['shape'],
    icon: alliance.blasonIcon as Blason['icon'],
    color1: alliance.blasonColor1,
    color2: alliance.blasonColor2,
  };

  const leaveMutation = trpc.alliance.leave.useMutation({
    onSuccess: () => {
      setLeaveConfirm(false);
      utils.alliance.myAlliance.invalidate();
    },
  });

  const memberCount = alliance.members.length;
  const { wins, losses, windowDays } = alliance.recentMilitary;
  const militaryTone =
    wins === 0 && losses === 0
      ? 'neutral'
      : wins >= losses
        ? 'positive'
        : 'negative';

  return (
    <>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0">
          <div
            className="h-full w-full opacity-40 blur-2xl"
            style={{
              background: `radial-gradient(circle at 25% 40%, ${blason.color1}, transparent 55%), radial-gradient(circle at 75% 60%, ${blason.color2}, transparent 60%)`,
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
        </div>

        <div className="absolute right-3 top-3 z-10 flex items-center gap-2 lg:right-4 lg:top-4">
          {isLeader && (
            <Button size="sm" variant="outline" onClick={() => navigate('/alliance/gestion')}>
              Gérer
            </Button>
          )}
          <AllianceHeroKebab onLeave={() => setLeaveConfirm(true)} />
        </div>

        <div className="relative px-5 pb-6 pt-8 lg:px-8 lg:pb-8 lg:pt-10">
          <div className="flex items-start gap-5">
            <div className="relative shrink-0">
              <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-primary/30 bg-background/40 p-2 shadow-lg shadow-primary/10 backdrop-blur lg:h-24 lg:w-24">
                <AllianceBlason blason={blason} size={72} title={`Blason de ${alliance.name}`} />
              </div>
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h1 className="truncate text-xl font-bold text-foreground lg:text-2xl">
                {alliance.name}
                <span className="ml-2 font-normal text-muted-foreground">[{alliance.tag}]</span>
              </h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Alliance · Rang #{alliance.rank}</p>
              {alliance.motto && (
                <p className="mt-2 text-xs italic leading-relaxed text-muted-foreground/80">« {alliance.motto} »</p>
              )}
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="inline-flex items-center rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] text-sky-300">
                  {memberCount} membre{memberCount > 1 ? 's' : ''}
                </span>
                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                  {alliance.totalPoints.toLocaleString('fr-FR')} pts
                </span>
                <span className="inline-flex items-center rounded-full border border-violet-500/30 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                  Fondée en {formatFounded(alliance.createdAt)}
                </span>
                {militaryTone === 'positive' && (
                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                    {windowDays}j · {wins}V / {losses}D
                  </span>
                )}
                {militaryTone === 'negative' && (
                  <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] text-red-300">
                    {windowDays}j · {wins}V / {losses}D
                  </span>
                )}
                {militaryTone === 'neutral' && (
                  <span className="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {windowDays}j · aucun combat
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={leaveConfirm}
        onConfirm={() => leaveMutation.mutate()}
        onCancel={() => setLeaveConfirm(false)}
        title="Quitter l'alliance ?"
        description="Vous ne pourrez pas revenir sans nouvelle invitation ou candidature."
        variant="destructive"
        confirmLabel="Quitter"
      />
    </>
  );
}
