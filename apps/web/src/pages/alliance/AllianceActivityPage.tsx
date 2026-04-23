import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { ActivityFeed } from '@/components/alliance/ActivityFeed';

export function AllianceActivityPage() {
  const utils = trpc.useUtils();
  const { data: unread } = trpc.alliance.activityUnreadCount.useQuery();
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6">
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <PageHeader
          title="Activité"
          actions={
            <Link
              to="/alliance"
              className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
            >
              ← Alliance
            </Link>
          }
        />

        <ActivityFeed
          unreadCount={unreadCount}
          onOpened={() => utils.alliance.activityUnreadCount.invalidate()}
        />
      </div>
    </div>
  );
}
