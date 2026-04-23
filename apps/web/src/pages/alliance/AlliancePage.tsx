import { Outlet, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { NoAllianceView } from './NoAllianceView';

type Alliance = NonNullable<ReturnType<typeof trpc.alliance.myAlliance.useQuery>['data']>;

export default function AlliancePage() {
  const { data: myAlliance, isLoading } = trpc.alliance.myAlliance.useQuery();
  const { data: invitations } = trpc.alliance.myInvitations.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Alliance" />
        <CardGridSkeleton count={2} />
      </div>
    );
  }

  if (!myAlliance) return <NoAllianceView invitations={invitations ?? []} />;

  return <Outlet context={{ alliance: myAlliance } satisfies { alliance: Alliance }} />;
}

export function useAllianceContext() {
  return useOutletContext<{ alliance: Alliance }>();
}
