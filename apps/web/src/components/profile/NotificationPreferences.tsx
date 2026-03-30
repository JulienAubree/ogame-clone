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

function Toggle({ enabled, onClick, size = 'md' }: { enabled: boolean; onClick: () => void; size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? `h-4 w-7 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`
    : `h-5 w-9 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted'}`;
  const dot = size === 'sm'
    ? `h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-[13px]' : 'translate-x-0.5'}`
    : `h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`;
  return (
    <button type="button" onClick={onClick} className={cls}>
      <div className={dot} />
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

  const globalAllDisabled = ALL_EVENT_TYPES.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));
  const globalSomeDisabled = ALL_EVENT_TYPES.some((et) => CHANNELS.some((ch) => prefs[ch].includes(et)));

  return (
    <div className="space-y-5">
      {/* Channel legend */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {CHANNELS.map((ch) => (
          <div key={ch} className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-white/[0.02] p-3">
            <span className="mt-0.5 text-primary/70 shrink-0">{CHANNEL_META[ch].icon}</span>
            <div>
              <div className="text-xs font-semibold text-foreground">{CHANNEL_META[ch].label}</div>
              <div className="text-[10px] text-muted-foreground leading-snug mt-0.5">{CHANNEL_META[ch].desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Global master toggle */}
      <div className="glass-card flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={`h-2.5 w-2.5 rounded-full ${globalAllDisabled ? 'bg-muted' : globalSomeDisabled ? 'bg-amber-400' : 'bg-emerald-400'}`} />
          <div>
            <div className="text-sm font-semibold">Toutes les notifications</div>
            <div className="text-[10px] text-muted-foreground">
              {globalAllDisabled ? 'Tout est désactivé' : globalSomeDisabled ? 'Configuration personnalisée' : 'Tout est activé'}
            </div>
          </div>
        </div>
        <Toggle enabled={!globalAllDisabled} onClick={toggleAll} />
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[1fr_repeat(3,48px)_48px] gap-1 items-end text-center px-1">
        <div />
        {CHANNELS.map((ch) => (
          <div key={ch} className="flex flex-col items-center gap-1">
            <span className="text-primary/60">{CHANNEL_META[ch].icon}</span>
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">{CHANNEL_META[ch].label}</span>
          </div>
        ))}
        <div className="flex flex-col items-center gap-1">
          <svg className="text-primary/60" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="7 18 12 13 17 18"/><polyline points="7 6 12 11 17 6"/></svg>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium">Tout</span>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {NOTIFICATION_CATEGORIES.map((cat) => {
          const eventTypes = getEventTypesForCategory(cat);
          const isExpanded = expanded.has(cat);
          const catAllDisabled = eventTypes.every((et) => CHANNELS.every((ch) => prefs[ch].includes(et)));

          return (
            <div key={cat} className="retro-card overflow-hidden">
              {/* Category row */}
              <div className="grid grid-cols-[1fr_repeat(3,48px)_48px] gap-1 items-center px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleExpand(cat)}
                  className="flex items-center gap-2 text-left group"
                >
                  <svg
                    className={`h-3 w-3 text-muted-foreground transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                  <span className="text-[13px] font-medium group-hover:text-primary transition-colors">
                    {NOTIFICATION_CATEGORY_LABELS[cat]}
                  </span>
                  {eventTypes.length > 1 && (
                    <span className="text-[10px] text-muted-foreground/60">{eventTypes.length}</span>
                  )}
                </button>
                {CHANNELS.map((ch) => {
                  const allDisabled = eventTypes.every((et) => prefs[ch].includes(et));
                  const someDisabled = eventTypes.some((et) => prefs[ch].includes(et));
                  return (
                    <div key={ch} className="flex justify-center relative">
                      <Toggle enabled={!allDisabled} onClick={() => toggleCategory(ch, cat)} />
                      {someDisabled && !allDisabled && (
                        <div className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
                      )}
                    </div>
                  );
                })}
                <div className="flex justify-center">
                  <Toggle enabled={!catAllDisabled} onClick={() => toggleCategoryRow(cat)} />
                </div>
              </div>

              {/* Expanded events */}
              {isExpanded && (
                <div className="border-t border-white/5">
                  {eventTypes.map((et, i) => {
                    const rowAllDisabled = CHANNELS.every((ch) => prefs[ch].includes(et));
                    return (
                      <div
                        key={et}
                        className={`grid grid-cols-[1fr_repeat(3,48px)_48px] gap-1 items-center pl-8 pr-3 py-2 ${i > 0 ? 'border-t border-white/[0.03]' : ''} ${rowAllDisabled ? 'opacity-50' : ''} transition-opacity`}
                      >
                        <span className="text-xs text-muted-foreground">{EVENT_TYPE_LABELS[et] ?? et}</span>
                        {CHANNELS.map((ch) => (
                          <div key={ch} className="flex justify-center">
                            <Toggle
                              size="sm"
                              enabled={!prefs[ch].includes(et)}
                              onClick={() => toggleEvent(ch, et)}
                            />
                          </div>
                        ))}
                        <div className="flex justify-center">
                          <Toggle
                            size="sm"
                            enabled={!rowAllDisabled}
                            onClick={() => toggleRow(et)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
