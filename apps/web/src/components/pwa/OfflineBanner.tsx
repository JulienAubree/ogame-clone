import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed top-12 left-0 right-0 z-50 flex items-center justify-center bg-destructive/90 px-4 py-1.5 text-xs font-medium text-destructive-foreground lg:top-14">
      Hors ligne — les données affichées peuvent ne pas être à jour
    </div>
  );
}
