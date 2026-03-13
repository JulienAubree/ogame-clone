import { Outlet } from 'react-router';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { trpc } from '@/trpc';

export function Layout() {
  const { data: planets } = trpc.planet.list.useQuery();
  const planetId = planets?.[0]?.id;

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar planetId={planetId} />
        <main className="flex-1 overflow-y-auto">
          <Outlet context={{ planetId }} />
        </main>
      </div>
    </div>
  );
}
