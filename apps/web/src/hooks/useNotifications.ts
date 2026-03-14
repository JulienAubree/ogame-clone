import { useSSE } from './useSSE';
import { trpc } from '@/trpc';
import { useToastStore } from '@/stores/toast.store';

export function useNotifications() {
  const utils = trpc.useUtils();
  const addToast = useToastStore((s) => s.addToast);

  useSSE((event) => {
    switch (event.type) {
      case 'new-message':
        utils.message.inbox.invalidate();
        utils.message.unreadCount.invalidate();
        addToast(`Nouveau message : ${event.payload.subject}`);
        break;
      case 'building-done':
        utils.building.list.invalidate();
        utils.resource.production.invalidate();
        addToast(`Construction terminée : ${event.payload.buildingId} niv. ${event.payload.level}`);
        break;
      case 'research-done':
        utils.research.list.invalidate();
        addToast(`Recherche terminée : ${event.payload.techId} niv. ${event.payload.level}`);
        break;
      case 'shipyard-done':
        utils.shipyard.queue.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();
        addToast(`Chantier terminé : ${event.payload.unitId} (x${event.payload.count})`);
        break;
    }
  });
}
