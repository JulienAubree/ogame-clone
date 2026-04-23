import { AllianceHero } from '@/components/alliance/AllianceHero';
import { ActivityPreviewCard } from '@/components/alliance/ActivityPreviewCard';
import { ChatPreviewCard } from '@/components/alliance/ChatPreviewCard';
import { MembersPreviewCard } from '@/components/alliance/MembersPreviewCard';
import { ManageShortcutCard } from '@/components/alliance/ManageShortcutCard';

interface AllianceHubProps {
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
    members: { userId: string; username: string; role: string; joinedAt: string; totalPoints?: number }[];
    totalPoints: number;
    rank: number;
    recentMilitary: { wins: number; losses: number; windowDays: number };
  };
}

export function AllianceHub({ alliance }: AllianceHubProps) {
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  return (
    <div className="space-y-4">
      <AllianceHero alliance={alliance} />

      <div className="px-4 pb-4 lg:px-6 lg:pb-6">
        <div className="mx-auto w-full max-w-[720px] space-y-4">
          <ActivityPreviewCard />
          <ChatPreviewCard />
          <MembersPreviewCard members={alliance.members} />
          {isLeader && <ManageShortcutCard />}
        </div>
      </div>
    </div>
  );
}
