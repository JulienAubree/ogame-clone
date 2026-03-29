import { useRef, useEffect } from 'react';
import { useSSE } from './useSSE';
import { trpc } from '@/trpc';
import { usePushSubscription } from './usePushSubscription';
import { useToastStore } from '@/stores/toast.store';
import { useChatStore } from '@/stores/chat.store';
import { getEntityName } from '@/lib/entity-names';

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
  usePushSubscription();
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
        utils.message.conversations.invalidate();
        utils.message.unreadCount.invalidate();
        // Open minimized chat bubble on desktop for player messages
        if (event.payload.type === 'player' && event.payload.senderId && event.payload.senderUsername) {
          const chatStore = useChatStore.getState();
          const alreadyOpen = chatStore.windows.find((w) => w.userId === event.payload.senderId);
          const tid = event.payload.threadId ? String(event.payload.threadId) : null;
          if (!alreadyOpen) {
            chatStore.openChat(String(event.payload.senderId), String(event.payload.senderUsername), tid);
            chatStore.minimizeChat(String(event.payload.senderId));
          } else {
            if (tid && !alreadyOpen.threadId) {
              chatStore.setThreadId(String(event.payload.senderId), tid);
            }
            if (alreadyOpen.threadId || tid) {
              utils.message.thread.invalidate({ threadId: (alreadyOpen.threadId || tid)! });
            }
          }
          chatStore.incrementUnread(String(event.payload.senderId));
        }
        addToast(`Message de ${event.payload.senderUsername ?? 'un joueur'}`);
        showBrowserNotification('Nouveau message', String(event.payload.senderUsername ?? 'Nouveau message'));
        break;
      case 'building-done':
        utils.building.list.invalidate();
        utils.resource.production.invalidate();
        addToast(`Construction terminée : ${event.payload.name ?? getEntityName(String(event.payload.buildingId))} niv. ${event.payload.level}`);
        showBrowserNotification('Construction terminée', `${event.payload.name ?? getEntityName(String(event.payload.buildingId))} niveau ${event.payload.level}`);
        break;
      case 'research-done':
        utils.research.list.invalidate();
        addToast(`Recherche terminée : ${event.payload.name ?? getEntityName(String(event.payload.techId))} niv. ${event.payload.level}`);
        showBrowserNotification('Recherche terminée', `${event.payload.name ?? getEntityName(String(event.payload.techId))} niveau ${event.payload.level}`);
        break;
      case 'shipyard-done': {
        utils.shipyard.queue.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();

        // Debounce: accumulate same-unit notifications over 3s window
        const unitId = String(event.payload.unitId);
        const name = String(event.payload.name ?? getEntityName(String(event.payload.unitId)));
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
      case 'fleet-arrived': {
        utils.fleet.movements.invalidate();
        utils.fleet.inbound.invalidate();
        utils.fleet.slots.invalidate();
        utils.resource.production.invalidate();
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        const arrivedLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
        addToast(`Flotte arrivée : mission ${event.payload.mission} en ${event.payload.targetCoords}`, 'info', arrivedLink);
        showBrowserNotification('Flotte arrivée', `Mission ${event.payload.mission} en ${event.payload.targetCoords}`);
        break;
      }
      case 'fleet-returned': {
        utils.fleet.movements.invalidate();
        utils.fleet.inbound.invalidate();
        utils.fleet.slots.invalidate();
        utils.resource.production.invalidate();
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        const returnedLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
        addToast(`Flotte de retour sur ${event.payload.originName}`, 'info', returnedLink);
        showBrowserNotification('Flotte de retour', `Flotte rentrée sur ${event.payload.originName}`);
        break;
      }
      case 'pve-mission-done': {
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        const pveLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : '/missions';
        addToast(`Mission ${event.payload.missionType} terminée en ${event.payload.targetCoords}`, 'success', pveLink);
        showBrowserNotification('Mission terminée', `${event.payload.missionType} en ${event.payload.targetCoords}`);
        break;
      }
      case 'tutorial-quest-complete':
        utils.tutorial.getCurrent.invalidate();
        utils.resource.production.invalidate();
        addToast(`Quête terminée : ${event.payload.questTitle}`);
        showBrowserNotification('Quête terminée !', String(event.payload.questTitle));
        break;
      case 'friend-request':
        utils.friend.pendingReceived.invalidate();
        addToast(`${event.payload.fromUsername} vous a envoyé une demande d'ami`);
        showBrowserNotification('Demande d\'ami', `${event.payload.fromUsername} vous a envoyé une demande d'ami`);
        break;
      case 'friend-accepted':
        utils.friend.list.invalidate();
        utils.friend.pendingSent.invalidate();
        addToast(`${event.payload.fromUsername} a accepté votre demande d'ami`);
        showBrowserNotification('Ami accepté', `${event.payload.fromUsername} a accepté votre demande d'ami`);
        break;
      case 'friend-declined':
        utils.friend.pendingSent.invalidate();
        addToast(`${event.payload.fromUsername} a refusé votre demande d'ami`);
        showBrowserNotification('Demande refusée', `${event.payload.fromUsername} a refusé votre demande d'ami`);
        break;
      case 'fleet-inbound':
        utils.fleet.inbound.invalidate();
        addToast(`Flotte en approche : ${event.payload.missionLabel} de ${event.payload.senderUsername} [${event.payload.originCoords}]`);
        showBrowserNotification('Flotte en approche', `${event.payload.senderUsername} envoie une mission ${event.payload.missionLabel}`);
        break;
      case 'fleet-hostile-inbound':
        utils.fleet.inbound.invalidate();
        addToast(`Attaque détectée vers ${event.payload.targetCoords} !`);
        showBrowserNotification('Attaque détectée !', `Flotte hostile en approche vers ${event.payload.targetCoords}`);
        break;
      case 'fleet-attack-landed': {
        utils.fleet.inbound.invalidate();
        utils.resource.production.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        const attackLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
        addToast(`Attaque de ${event.payload.attackerUsername} sur ${event.payload.targetCoords} — ${event.payload.outcome}`, 'error', attackLink);
        showBrowserNotification('Planète attaquée !', `Attaque de ${event.payload.attackerUsername} sur ${event.payload.targetCoords} — ${event.payload.outcome}`);
        break;
      }
      case 'market-offer-reserved': {
        utils.market.myOffers.invalidate();
        const resLabel: Record<string, string> = { minerai: 'Minerai', silicium: 'Silicium', hydrogene: 'Hydrogène' };
        const resName = resLabel[String(event.payload.resourceType)] ?? event.payload.resourceType;
        const qty = Number(event.payload.quantity).toLocaleString('fr-FR');
        const pName = event.payload.planetName ?? 'votre planète';
        addToast(`Offre acceptée : ${qty} ${resName}. Un cargo est en route vers ${pName}`);
        showBrowserNotification('Offre acceptée', `${qty} ${resName} — cargo en route vers ${pName}`);
        break;
      }
      case 'market-offer-sold':
        utils.market.myOffers.invalidate();
        utils.resource.production.invalidate();
        addToast('Vente finalisée ! Paiement reçu');
        showBrowserNotification('Vente finalisée', `${event.payload.quantity}x ${event.payload.resourceType} vendu`);
        break;
      case 'market-offer-expired':
        utils.market.myOffers.invalidate();
        utils.resource.production.invalidate();
        addToast(`Offre expirée, ressources restituées (${event.payload.quantity}x ${event.payload.resourceType})`);
        showBrowserNotification('Offre expirée', 'Ressources restituées');
        break;
      case 'daily-quest-completed':
        utils.exilium.getBalance.invalidate();
        utils.dailyQuest.getQuests.invalidate();
        addToast(`Quete completee : ${event.payload.questName}`, 'success');
        showBrowserNotification('Quete completee', `+${event.payload.reward} Exilium`);
        break;
      case 'flagship-incapacitated':
        utils.flagship.get.invalidate();
        addToast('Votre vaisseau amiral a été mis hors service !', 'error', '/flagship');
        showBrowserNotification('Vaisseau amiral détruit !', `Combat en ${event.payload.coords} — réparation en cours`);
        break;
      case 'new-alliance-message': {
        const allianceId = String(event.payload.allianceId);
        utils.message.allianceChat.invalidate({ allianceId });
        const chatStore = useChatStore.getState();
        const key = `alliance:${allianceId}`;
        const alreadyOpen = chatStore.windows.find((w) => w.userId === key);
        if (!alreadyOpen) {
          chatStore.openAllianceChat(allianceId, '', String(event.payload.allianceTag));
          chatStore.minimizeChat(key);
        }
        chatStore.incrementUnread(key);
        addToast(`[${event.payload.allianceTag}] ${event.payload.senderUsername}`);
        showBrowserNotification('Chat Alliance', `${event.payload.senderUsername}: nouveau message`);
        break;
      }
      case 'alliance-activity': {
        utils.alliance.myAlliance.invalidate();
        const payload = event.payload;
        let msg = '';
        if (payload.action === 'invitation') {
          msg = `Invitation alliance [${payload.allianceTag}] reçue`;
        } else if (payload.action === 'application') {
          msg = `Candidature de ${payload.applicantUsername} [${payload.allianceTag}]`;
        } else if (payload.action === 'circular') {
          msg = `[Alliance] ${payload.senderUsername} : ${payload.subject}`;
        }
        if (msg) {
          addToast(msg, 'info', '/alliance');
          showBrowserNotification('Alliance', msg);
        }
        break;
      }
    }
  });
}
