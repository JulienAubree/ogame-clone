import { trpc } from '@/trpc';
import { ExiliumIcon } from '@/components/common/ExiliumIcon';
import { useState } from 'react';

export function DailyQuestWidget() {
  // Push-driven: useNotifications invalidates dailyQuest.getQuests on
  // `daily-quest-completed` SSE events, the poll was redundant.
  const { data, isLoading } = trpc.dailyQuest.getQuests.useQuery();
  const [userToggled, setUserToggled] = useState<boolean | null>(null);

  if (isLoading || !data) return null;

  const hasCompleted = data.quests.some(q => q.status === 'completed');
  const isCollapsed = userToggled ?? hasCompleted;
  const pendingCount = data.quests.filter(q => q.status === 'pending').length;

  const now = new Date();
  const endOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59));
  const msRemaining = Math.max(0, endOfDay.getTime() - now.getTime());
  const hoursRemaining = Math.floor(msRemaining / 3600000);
  const minutesRemaining = Math.floor((msRemaining % 3600000) / 60000);

  if (isCollapsed) {
    return (
      <button
        onClick={() => setUserToggled(false)}
        className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-card/95 px-3 py-2 text-xs backdrop-blur-sm"
      >
        <ExiliumIcon size={12} className="text-purple-400" />
        <span className="text-purple-400">
          {hasCompleted ? 'Completee' : `${pendingCount}/3`}
        </span>
      </button>
    );
  }

  return (
    <div className="w-72 rounded-lg border border-purple-500/30 bg-card/95 shadow-lg backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <ExiliumIcon size={14} className="text-purple-400" />
          <span className="text-xs font-semibold text-purple-400">Quetes du jour</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">1 Exilium</span>
          <button
            onClick={() => setUserToggled(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {data.quests.map(quest => (
          <div key={quest.id} className="flex items-start gap-2">
            <div className="mt-0.5">
              {quest.status === 'completed' ? (
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : quest.status === 'expired' ? (
                <svg className="h-4 w-4 text-muted-foreground/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <div className="h-4 w-4 rounded border border-border" />
              )}
            </div>
            <div>
              <span className={`text-xs font-medium ${
                quest.status === 'completed' ? 'text-emerald-400' :
                quest.status === 'expired' ? 'text-muted-foreground/40 line-through' :
                'text-foreground'
              }`}>
                {quest.name}
              </span>
              <p className={`text-[10px] ${
                quest.status === 'expired' ? 'text-muted-foreground/30' : 'text-muted-foreground'
              }`}>
                {quest.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-border/50 px-3 py-1.5">
        <span className={`text-[10px] ${hoursRemaining < 1 ? 'text-destructive' : 'text-muted-foreground'}`}>
          Expire dans {hoursRemaining}h {minutesRemaining.toString().padStart(2, '0')}m
        </span>
      </div>
    </div>
  );
}
