import { useEffect } from 'react';
import { trpc } from '@/trpc';

export function useDocumentTitle() {
  const { data } = trpc.gameEvent.unreadCount.useQuery();

  useEffect(() => {
    const count = data?.count ?? 0;
    document.title = count > 0 ? `(${count}) Exilium` : 'Exilium';
  }, [data?.count]);
}
