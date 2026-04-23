import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Blason } from '@exilium/shared';
import { trpc } from '@/trpc';
import { AllianceBlason } from './AllianceBlason';
import { AllianceHeroStats } from './AllianceHeroStats';
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

  return (
    <>
      <section className="glass-card p-4 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <AllianceBlason blason={blason} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">
              {alliance.name} <span className="font-normal text-muted-foreground">[{alliance.tag}]</span>
            </h2>
            {alliance.motto && (
              <p className="mt-1 line-clamp-1 text-sm italic text-foreground/80">« {alliance.motto} »</p>
            )}
            <div className="mt-3">
              <AllianceHeroStats
                memberCount={alliance.members.length}
                rank={alliance.rank}
                totalPoints={alliance.totalPoints}
                foundedAt={alliance.createdAt}
                recentMilitary={alliance.recentMilitary}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-center">
            {isLeader && (
              <Button size="sm" variant="outline" onClick={() => navigate('/alliance/gestion')}>
                Gérer
              </Button>
            )}
            <AllianceHeroKebab onLeave={() => setLeaveConfirm(true)} />
          </div>
        </div>
      </section>

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
