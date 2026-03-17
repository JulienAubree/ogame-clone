import { useRef, useEffect } from 'react';
import { useSSE } from './useSSE';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';

function showBrowserNotification(title: string, body: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission === 'granted' && document.hidden) {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

function requestNotificationPermission() {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

interface ShipyardBufferEntry {
  name: string;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

const SHIPYARD_DEBOUNCE_MS = 3_000;

export function useNotifications() {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);
  const permissionRequested = useRef(false);
  const shipyardBuffer = useRef<Map<string, ShipyardBufferEntry>>(new Map());

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const entry of shipyardBuffer.current.values()) {
        clearTimeout(entry.timer);
      }
    };
  }, []);

  useSSE((event) => {
    // Request permission on first event
    if (!permissionRequested.current) {
      permissionRequested.current = true;
      requestNotificationPermission();
    }

    // Invalidate game event queries on any game event (not messages)
    if (event.type !== 'new-message') {
      utils.gameEvent.unreadCount.invalidate();
      utils.gameEvent.recent.invalidate();
      utils.gameEvent.byPlanet.invalidate();
    }

    switch (event.type) {
      case 'new-message':
        utils.message.inbox.invalidate();
        utils.message.unreadCount.invalidate();
        addToast(`Nouveau message : ${event.payload.subject}`);
        showBrowserNotification('Nouveau message', String(event.payload.subject));
        break;
      case 'building-done':
        utils.building.list.invalidate();
        utils.resource.production.invalidate();
        addToast(`Construction terminée : ${event.payload.name ?? event.payload.buildingId} niv. ${event.payload.level}`);
        showBrowserNotification('Construction terminée', `${event.payload.name ?? event.payload.buildingId} niveau ${event.payload.level}`);
        break;
      case 'research-done':
        utils.research.list.invalidate();
        addToast(`Recherche terminée : ${event.payload.name ?? event.payload.techId} niv. ${event.payload.level}`);
        showBrowserNotification('Recherche terminée', `${event.payload.name ?? event.payload.techId} niveau ${event.payload.level}`);
        break;
      case 'shipyard-done': {
        utils.shipyard.queue.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();

        // Debounce: accumulate same-unit notifications over 3s window
        const unitId = String(event.payload.unitId);
        const name = String(event.payload.name ?? event.payload.unitId);
        const count = Number(event.payload.count) || 1;

        const existing = shipyardBuffer.current.get(unitId);
        if (existing) {
          clearTimeout(existing.timer);
          existing.count += count;
          existing.name = name;
        }

        const entry = existing ?? { name, count, timer: undefined as any };

        entry.timer = setTimeout(() => {
          shipyardBuffer.current.delete(unitId);
          addToast(`Chantier terminé : ${entry.count}x ${entry.name}`);
          showBrowserNotification('Production terminée', `${entry.count}x ${entry.name}`);
        }, SHIPYARD_DEBOUNCE_MS);

        shipyardBuffer.current.set(unitId, entry);
        break;
      }
      case 'fleet-arrived':
        utils.fleet.movements.invalidate();
        utils.resource.production.invalidate();
        addToast(`Flotte arrivée : mission ${event.payload.mission} en ${event.payload.targetCoords}`);
        showBrowserNotification('Flotte arrivée', `Mission ${event.payload.mission} en ${event.payload.targetCoords}`);
        break;
      case 'fleet-returned':
        utils.fleet.movements.invalidate();
        utils.resource.production.invalidate();
        addToast(`Flotte de retour sur ${event.payload.originName}`);
        showBrowserNotification('Flotte de retour', `Flotte rentrée sur ${event.payload.originName}`);
        break;
    }
  });
}
