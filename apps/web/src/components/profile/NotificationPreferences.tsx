import { trpc } from '@/trpc';
import { useCallback, useRef, useState } from 'react';
import {
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_CATEGORY_LABELS,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_TO_CATEGORY,
  getEventTypesForCategory,
} from '@exilium/shared';
import type { NotificationCategory } from '@exilium/shared';

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_TO_CATEGORY);

const CHANNELS = ['toastDisabled', 'pushDisabled', 'bellDisabled'] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_META: Record<Channel, { label: string; desc: string; icon: React.ReactNode }> = {
  toastDisabled: {
    label: 'Toast',
    desc: 'Bandeau temporaire en bas de l\'écran (5s)',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M8 12h8"/></svg>
    ),
  },
  pushDisabled: {
    label: 'Push',
    desc: 'Notification navigateur / appareil',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
    ),
  },
  bellDisabled: {
    label: 'Cloche',
    desc: 'Historique dans le fil d\'activité',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
    ),
  },
};

function Toggle({ enabled, onClick }: { enabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-muted'}`}
    >
      <div
        className={`h-4 w-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

export function NotificationPreferences() {
  const { data: prefs, isLoading } = trpc.notificationPreferences.getPreferences.useQuery();
  const utils = trpc.useUtils();
  const mutation = trpc.notificationPreferences.updatePreferences.useMutation({
    onSuccess: (data) => {
      utils.notificationPreferences.getPreferences.setData(undefined, data);
    },
  });

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<typeof prefs>(undefined);
  const [expanded, setExpanded] = useState<Set<NotificationCategory>>(new Set());

  const scheduleUpdate = useCallback((next: NonNullable<typeof prefs>) => {
    pendingRef.current = next;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (pendingRef.current) {
        mutation.mutate(pendingRef.current);
      }
    }, 500);
  }, [mutation]);

  function applyUpdate(updated: NonNullable<typeof prefs>) {
    utils.notificationPreferences.getPreferences.setData(undefined, updated);
    scheduleUpdate(updated);
  }

  function toggleEvent(channel: Channel, eventType: string) {
    if (!prefs) return;
    const current = prefs[channel];
    const next = current.includes(eventType)
      ? current.filter((e) => e !== eventType)
      : [...current, eventType];
    applyUpdate({ ...prefs, [channel]: next });
  }

  function toggleRow(eventType: string) {
    if (!prefs) return;
    const allDisabled = CHANNELS.every((ch) => prefs[ch].includes(eventType));
    const updated = { ...prefs };
    for (const ch of CHANNELS) {
      updated[ch] = allDisabled
        ? updated[ch].filter((e) => e !== eventType)
        : [...updated[ch].filter((e) => e !== eventType), eventType];
    }
    applyUpdate(updated);
  }

  function toggleCategoryRow(category: NotificationCategory) {
    if (!prefs) return;
    const eventTypes = getEventTypesForCategory(category);
    const allDisabled = eventTypes.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));
    const updated = { ...prefs };
    for (const ch of CHANNELS) {
      updated[ch] = allDisabled
        ? updated[ch].filter((e) => !eventTypes.includes(e))
        : [...updated[ch].filter((e) => !eventTypes.includes(e)), ...eventTypes];
    }
    applyUpdate(updated);
  }

  function toggleAll() {
    if (!prefs) return;
    const allDisabled = ALL_EVENT_TYPES.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));
    const updated = { ...prefs };
    for (const ch of CHANNELS) {
      updated[ch] = allDisabled ? [] : [...ALL_EVENT_TYPES];
    }
    applyUpdate(updated);
  }

  function toggleCategory(channel: Channel, category: NotificationCategory) {
    if (!prefs) return;
    const eventTypes = getEventTypesForCategory(category);
    const current = prefs[channel];
    const allDisabled = eventTypes.every((et) => current.includes(et));
    const next = allDisabled
      ? current.filter((e) => !eventTypes.includes(e))
      : [...current.filter((e) => !eventTypes.includes(e)), ...eventTypes];
    applyUpdate({ ...prefs, [channel]: next });
  }

  function toggleExpand(cat: NotificationCategory) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  if (isLoading || !prefs) {
    return <div className="text-sm text-muted-foreground p-4">Chargement...</div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Choisissez quels événements déclenchent chaque type de notification. Cliquez sur une catégorie pour régler chaque événement individuellement.
      </p>

      {/* Channel descriptions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {CHANNELS.map((ch) => (
          <div key={ch} className="flex items-start gap-2 rounded-lg border border-border/30 bg-muted/30 p-2.5">
            <span className="mt-0.5 text-muted-foreground shrink-0">{CHANNEL_META[ch].icon}</span>
            <div>
              <div className="text-xs font-medium">{CHANNEL_META[ch].label}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{CHANNEL_META[ch].desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Global master toggle */}
      {(() => {
        const allDisabled = ALL_EVENT_TYPES.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));
        const someDisabled = ALL_EVENT_TYPES.some((et) => CHANNELS.some((ch) => prefs[ch].includes(et)));
        return (
          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Toutes les notifications</div>
              <div className="text-[10px] text-muted-foreground">
                {allDisabled ? 'Tout désactivé' : someDisabled ? 'Partiellement actif' : 'Tout activé'}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {someDisabled && !allDisabled && (
                <div className="h-2 w-2 rounded-full bg-amber-400" />
              )}
              <Toggle enabled={!allDisabled} onClick={toggleAll} />
            </div>
          </div>
        );
      })()}

      {/* Header row */}
      <div className="grid grid-cols-[1fr_repeat(3,56px)_44px] gap-1 items-center text-center">
        <div />
        {CHANNELS.map((ch) => (
          <div key={ch} className="flex flex-col items-center gap-0.5">
            {CHANNEL_META[ch].icon}
            <span className="text-[10px] text-muted-foreground">{CHANNEL_META[ch].label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12H2m4.314-5.686L4.9 4.9m5.686-2.414V.6M17.686 6.314 19.1 4.9M22 12h-2m-4.314 5.686L17.1 19.1M12 22v-1.886M6.314 17.686 4.9 19.1"/><circle cx="12" cy="12" r="4"/></svg>
          <span className="text-[10px] text-muted-foreground">Tout</span>
        </div>
      </div>

      {/* Category rows with expandable events */}
      {NOTIFICATION_CATEGORIES.map((cat) => {
        const eventTypes = getEventTypesForCategory(cat);
        const isExpanded = expanded.has(cat);

        return (
          <div key={cat} className="rounded-lg border border-border/50 overflow-hidden">
            {/* Category header row */}
            <div className="grid grid-cols-[1fr_repeat(3,56px)_44px] gap-1 items-center px-3 py-2 bg-muted/20">
              <button
                type="button"
                onClick={() => toggleExpand(cat)}
                className="flex items-center gap-2 text-sm font-medium text-left"
              >
                <svg
                  className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
                {NOTIFICATION_CATEGORY_LABELS[cat]}
                <span className="text-[10px] text-muted-foreground font-normal">({eventTypes.length})</span>
              </button>
              {CHANNELS.map((ch) => {
                const allDisabled = eventTypes.every((et) => prefs[ch].includes(et));
                const someDisabled = eventTypes.some((et) => prefs[ch].includes(et));
                return (
                  <div key={ch} className="flex justify-center relative">
                    <Toggle
                      enabled={!allDisabled}
                      onClick={() => toggleCategory(ch, cat)}
                    />
                    {someDisabled && !allDisabled && (
                      <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-amber-400" />
                    )}
                  </div>
                );
              })}
              <div className="flex justify-center">
                {(() => {
                  const catAllDisabled = eventTypes.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));
                  return <Toggle enabled={!catAllDisabled} onClick={() => toggleCategoryRow(cat)} />;
                })()}
              </div>
            </div>

            {/* Expanded individual events */}
            {isExpanded && (
              <div className="border-t border-border/30">
                {eventTypes.map((et) => (
                  <div
                    key={et}
                    className="grid grid-cols-[1fr_repeat(3,56px)_44px] gap-1 items-center px-3 py-1.5 pl-9"
                  >
                    <span className="text-xs text-muted-foreground">{EVENT_TYPE_LABELS[et] ?? et}</span>
                    {CHANNELS.map((ch) => (
                      <div key={ch} className="flex justify-center">
                        <Toggle
                          enabled={!prefs[ch].includes(et)}
                          onClick={() => toggleEvent(ch, et)}
                        />
                      </div>
                    ))}
                    <div className="flex justify-center">
                      <Toggle
                        enabled={!CHANNELS.every((ch) => prefs[ch].includes(et))}
                        onClick={() => toggleRow(et)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
