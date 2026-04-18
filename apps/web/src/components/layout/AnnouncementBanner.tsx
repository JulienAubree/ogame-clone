import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { X } from 'lucide-react';
import { trpc } from '@/trpc';

const VARIANT_CLASS: Record<'info' | 'warning' | 'success', string> = {
  info: 'bg-primary/90 text-primary-foreground',
  warning: 'bg-destructive/90 text-destructive-foreground',
  success: 'bg-emerald-600/90 text-white',
};

function dismissKey(id: string) {
  return `announcement_dismissed_${id}`;
}

function readDismissed(id: string | undefined): boolean {
  if (!id) return false;
  try {
    return sessionStorage.getItem(dismissKey(id)) === '1';
  } catch {
    return false;
  }
}

export function AnnouncementBanner() {
  const { data } = trpc.announcement.active.useQuery(undefined, {
    staleTime: 60_000,
  });

  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(data?.id));

  // Re-sync dismissed state when active announcement changes (new id means
  // previous dismissals shouldn't silence a newly-activated announcement).
  useEffect(() => {
    setDismissed(readDismissed(data?.id));
  }, [data?.id]);

  if (!data) return null;
  if (dismissed) return null;

  const variantClass = VARIANT_CLASS[data.variant as 'info' | 'warning' | 'success'] ?? VARIANT_CLASS.info;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(dismissKey(data.id), '1');
    } catch {
      // sessionStorage unavailable — still hide banner for this render cycle
    }
    setDismissed(true);
  };

  return (
    <div
      className={`flex items-center justify-center gap-3 px-4 py-1.5 text-xs font-medium ${variantClass}`}
    >
      <span className="flex-1 text-center">{data.message}</span>
      {data.changelogId && (
        <Link
          to={`/changelog/${data.changelogId}`}
          className="whitespace-nowrap underline hover:no-underline"
        >
          Voir →
        </Link>
      )}
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Fermer"
        className="opacity-70 hover:opacity-100"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
