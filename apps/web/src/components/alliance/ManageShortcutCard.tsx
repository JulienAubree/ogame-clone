import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function ManageShortcutCard() {
  const { data: applications } = trpc.alliance.applications.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const count = applications?.length ?? 0;

  return (
    <Link to="/alliance/gestion" className="block">
      <section className="glass-card flex min-w-0 flex-col p-4 transition-colors hover:bg-accent/30">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="truncate text-base font-semibold">Gestion</h3>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
              {count}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {count === 0
            ? 'Aucune candidature en attente.'
            : `${count} candidature${count > 1 ? 's' : ''} en attente.`}
        </p>
        <p className="mt-2 text-xs text-primary">Ouvrir la gestion →</p>
      </section>
    </Link>
  );
}
