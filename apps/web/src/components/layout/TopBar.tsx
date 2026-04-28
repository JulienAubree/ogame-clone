import { useState } from 'react';
import { Mail } from 'lucide-react';
import { FlagshipNamingModal } from '@/components/flagship/FlagshipNamingModal';
import { useNavigate, Link } from 'react-router';
import { trpc } from '@/trpc';
import { usePlanetStore } from '@/stores/planet.store';
import { ReportsIcon } from '@/lib/icons';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PlanetSelectorDropdown } from './topbar/PlanetSelectorDropdown';
import { DailyQuestDropdown } from './topbar/DailyQuestDropdown';
import { OnboardingButton } from './topbar/OnboardingButton';
import { NotificationsBell } from './topbar/NotificationsBell';
import { ProfileMenu } from './topbar/ProfileMenu';

interface Planet {
  id: string;
  name: string;
  galaxy: number;
  system: number;
  position: number;
  planetClassId: string | null;
  planetImageIndex: number | null;
  status?: string;
}

export function TopBar({ planetId, planets }: { planetId: string | null; planets: Planet[] }) {
  useGameConfig();
  const navigate = useNavigate();
  const setActivePlanet = usePlanetStore((s) => s.setActivePlanet);
  const [showNamingModal, setShowNamingModal] = useState(false);

  const { data: tutorialData } = trpc.tutorial.getCurrent.useQuery();
  const tutorialComplete = tutorialData?.isComplete ?? true;
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const { data: reportUnreadCount } = trpc.report.unreadCount.useQuery();

  return (
    <>
      <header className="sticky top-0 z-40 flex min-h-12 lg:min-h-14 items-center justify-between border-b border-white/10 bg-card/80 backdrop-blur-md px-4 pt-[env(safe-area-inset-top)] lg:px-6">
        {/* Planet selector — mobile only. Desktop shows it in the planet block (PlanetSubnav). */}
        <div className="flex items-center gap-4 lg:invisible">
          <PlanetSelectorDropdown
            planetId={planetId}
            planets={planets}
            onSelect={setActivePlanet}
          />
        </div>

        <div className="flex items-center gap-1 lg:gap-2">
          {tutorialComplete ? (
            <DailyQuestDropdown />
          ) : (
            <OnboardingButton showNamingModal={() => setShowNamingModal(true)} />
          )}

          {/* Messages (envelope) */}
          <button
            onClick={() => navigate('/messages')}
            className="relative rounded-lg p-2 lg:p-2.5 text-muted-foreground touch-feedback hover:bg-accent hover:text-foreground"
            title="Messages"
          >
            <Mail className="h-5 w-5" />
            {(unreadCount ?? 0) > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {unreadCount}
              </span>
            )}
          </button>

          <NotificationsBell />

          <Link
            to="/reports"
            className="relative rounded-lg p-2 lg:p-2.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Rapports"
          >
            <ReportsIcon width={18} height={18} />
            {(reportUnreadCount?.count ?? 0) > 0 && (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
                {reportUnreadCount!.count}
              </span>
            )}
          </Link>

          <ProfileMenu />
        </div>
      </header>

      <FlagshipNamingModal open={showNamingModal} onClose={() => setShowNamingModal(false)} />
    </>
  );
}
