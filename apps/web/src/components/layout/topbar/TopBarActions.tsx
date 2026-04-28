import { useState } from 'react';
import { Mail } from 'lucide-react';
import { useNavigate, Link } from 'react-router';
import { trpc } from '@/trpc';
import { ReportsIcon } from '@/lib/icons';
import { FlagshipNamingModal } from '@/components/flagship/FlagshipNamingModal';
import { DailyQuestDropdown } from './DailyQuestDropdown';
import { OnboardingButton } from './OnboardingButton';
import { NotificationsBell } from './NotificationsBell';
import { ProfileMenu } from './ProfileMenu';

/**
 * Right-side cluster of header actions (daily quest / messages / notifications
 * / reports / profile). Shared by the mobile topbar and the desktop planet
 * block (PlanetSubnav).
 */
export function TopBarActions() {
  const navigate = useNavigate();
  const [showNamingModal, setShowNamingModal] = useState(false);

  const { data: tutorialData } = trpc.tutorial.getCurrent.useQuery();
  const tutorialComplete = tutorialData?.isComplete ?? true;
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const { data: reportUnreadCount } = trpc.report.unreadCount.useQuery();

  return (
    <>
      <div className="flex items-center gap-1 lg:gap-2">
        {tutorialComplete ? (
          <DailyQuestDropdown />
        ) : (
          <OnboardingButton showNamingModal={() => setShowNamingModal(true)} />
        )}

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

      <FlagshipNamingModal open={showNamingModal} onClose={() => setShowNamingModal(false)} />
    </>
  );
}
