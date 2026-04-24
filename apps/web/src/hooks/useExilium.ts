import { trpc } from '@/trpc';

export function useExilium() {
  // Push-driven: useNotifications invalidates exilium.getBalance on
  // `daily-quest-completed`. Other balance changes (talent reroll, hull
  // change, market trades) happen through mutations that call invalidate
  // in onSuccess, so the 30s poll was pure overhead.
  return trpc.exilium.getBalance.useQuery();
}
