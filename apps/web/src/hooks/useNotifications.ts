import { useRef, useEffect } from 'react';
import { useSSE } from './useSSE';
import { trpc } from '@/trpc';
import { usePushSubscription } from './usePushSubscription';
import { useToastStore } from '@/stores/toast.store';
import { useChatStore } from '@/stores/chat.store';
import { getEntityName } from '@/lib/entity-names';

let pushSubscriptionActive: boolean | null = null;

async function hasPushSubscription(): Promise<boolean> {
  if (pushSubscriptionActive !== null) return pushSubscriptionActive;
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      pushSubscriptionActive = false;
      return false;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    pushSubscriptionActive = !!sub;
    return pushSubscriptionActive;
  } catch {
    pushSubscriptionActive = false;
    return false;
  }
}

async function showBrowserNotification(title: string, body: string) {
  if (typeof Notification === 'undefined') return;
  if (Notification.permission !== 'granted' || !document.hidden) return;
  // Skip if push notifications are active — service worker handles it
  if (await hasPushSubscription()) return;
  new Notification(title, { body, icon: '/favicon.ico' });
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
  planetId?: string;
  buildType?: string;
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

  const { data: notifPrefs } = trpc.notificationPreferences.getPreferences.useQuery();

  function isToastEnabled(eventType: string): boolean {
    if (!notifPrefs) return true;
    return !notifPrefs.toastDisabled.includes(eventType);
  }

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
        if (isToastEnabled(event.type)) {
          addToast(`Message de ${event.payload.senderUsername ?? 'un joueur'}`);
          showBrowserNotification('Nouveau message', String(event.payload.senderUsername ?? 'Nouveau message'));
        }
        break;
      case 'building-done':
        utils.building.list.invalidate();
        utils.resource.production.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Construction terminée : ${event.payload.name ?? getEntityName(String(event.payload.buildingId))} niv. ${event.payload.level}`, 'info', '/buildings', event.payload.planetId as string | undefined);
          showBrowserNotification('Construction terminée', `${event.payload.name ?? getEntityName(String(event.payload.buildingId))} niveau ${event.payload.level}`);
        }
        break;
      case 'research-done':
        utils.research.list.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Recherche terminée : ${event.payload.name ?? getEntityName(String(event.payload.techId))} niv. ${event.payload.level}`, 'info', '/research', event.payload.planetId as string | undefined);
          showBrowserNotification('Recherche terminée', `${event.payload.name ?? getEntityName(String(event.payload.techId))} niveau ${event.payload.level}`);
        }
        break;
      case 'shipyard-done': {
        utils.shipyard.queue.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();

        // Debounce: accumulate same-unit notifications over 3s window
        const unitId = String(event.payload.unitId);
        const name = String(event.payload.name ?? getEntityName(String(event.payload.unitId)));
        const count = Number(event.payload.count) || 1;
        const shipPlanetId = event.payload.planetId as string | undefined;
        const buildType = event.payload.buildType as string | undefined;

        const existing = shipyardBuffer.current.get(unitId);
        if (existing) {
          clearTimeout(existing.timer);
          existing.count += count;
          existing.name = name;
        }

        const entry = existing ?? { name, count, timer: undefined as any, planetId: shipPlanetId, buildType };

        entry.timer = setTimeout(() => {
          shipyardBuffer.current.delete(unitId);
          if (isToastEnabled('shipyard-done')) {
            const link = entry.buildType === 'defense' ? '/defense' : '/fleet';
            addToast(`Chantier terminé : ${entry.count}x ${entry.name}`, 'info', link, entry.planetId);
            showBrowserNotification('Production terminée', `${entry.count}x ${entry.name}`);
          }
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
        if (isToastEnabled(event.type)) {
          const arrivedLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
          addToast(`Flotte arrivée : mission ${event.payload.mission} en ${event.payload.targetCoords}`, 'info', arrivedLink);
          showBrowserNotification('Flotte arrivée', `Mission ${event.payload.mission} en ${event.payload.targetCoords}`);
        }
        break;
      }
      case 'fleet-returned': {
        utils.fleet.movements.invalidate();
        utils.fleet.inbound.invalidate();
        utils.fleet.slots.invalidate();
        utils.resource.production.invalidate();
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        if (isToastEnabled(event.type)) {
          const returnedLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
          addToast(`Flotte de retour sur ${event.payload.originName}`, 'info', returnedLink);
          showBrowserNotification('Flotte de retour', `Flotte rentrée sur ${event.payload.originName}`);
        }
        break;
      }
      case 'pve-mission-done': {
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        if (isToastEnabled(event.type)) {
          const pveLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : '/missions';
          addToast(`Mission ${event.payload.missionType} terminée en ${event.payload.targetCoords}`, 'success', pveLink);
          showBrowserNotification('Mission terminée', `${event.payload.missionType} en ${event.payload.targetCoords}`);
        }
        break;
      }
      case 'tutorial-quest-pending':
        utils.tutorial.getCurrent.invalidate();
        utils.resource.production.invalidate();
        break;
      case 'tutorial-quest-complete':
        utils.tutorial.getCurrent.invalidate();
        utils.resource.production.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Quête terminée : ${event.payload.questTitle}`);
          showBrowserNotification('Quête terminée !', String(event.payload.questTitle));
        }
        break;
      case 'friend-request':
        utils.friend.pendingReceived.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`${event.payload.fromUsername} vous a envoyé une demande d'ami`);
          showBrowserNotification('Demande d\'ami', `${event.payload.fromUsername} vous a envoyé une demande d'ami`);
        }
        break;
      case 'friend-accepted':
        utils.friend.list.invalidate();
        utils.friend.pendingSent.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`${event.payload.fromUsername} a accepté votre demande d'ami`);
          showBrowserNotification('Ami accepté', `${event.payload.fromUsername} a accepté votre demande d'ami`);
        }
        break;
      case 'friend-declined':
        utils.friend.pendingSent.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`${event.payload.fromUsername} a refusé votre demande d'ami`);
          showBrowserNotification('Demande refusée', `${event.payload.fromUsername} a refusé votre demande d'ami`);
        }
        break;
      case 'report-sold':
        utils.market.myOffers.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`${event.payload.buyerUsername} a acheté votre rapport d'exploration [${event.payload.galaxy}:${event.payload.system}:?]`);
          showBrowserNotification('Rapport vendu', `${event.payload.buyerUsername} a acheté votre rapport`);
        }
        break;
      case 'report-purchased':
        utils.galaxy.system.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Rapport d'exploration acquis — ${event.payload.biomeCount} biomes révélés en [${event.payload.galaxy}:${event.payload.system}:${event.payload.position}]`);
          showBrowserNotification('Rapport acheté', `${event.payload.biomeCount} biomes révélés`);
        }
        break;
      case 'fleet-inbound':
        utils.fleet.inbound.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Flotte en approche : ${event.payload.missionLabel} de ${event.payload.senderUsername} [${event.payload.originCoords}]`);
          showBrowserNotification('Flotte en approche', `${event.payload.senderUsername} envoie une mission ${event.payload.missionLabel}`);
        }
        break;
      case 'fleet-hostile-inbound':
        utils.fleet.inbound.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Attaque détectée vers ${event.payload.targetCoords} !`);
          showBrowserNotification('Attaque détectée !', `Flotte hostile en approche vers ${event.payload.targetCoords}`);
        }
        break;
      case 'fleet-attack-landed': {
        utils.fleet.inbound.invalidate();
        utils.resource.production.invalidate();
        utils.shipyard.ships.invalidate();
        utils.shipyard.defenses.invalidate();
        utils.report.list.invalidate();
        utils.report.unreadCount.invalidate();
        if (isToastEnabled(event.type)) {
          const attackLink = event.payload.reportId ? `/reports/${event.payload.reportId}` : undefined;
          addToast(`Attaque de ${event.payload.attackerUsername} sur ${event.payload.targetCoords} — ${event.payload.outcome}`, 'error', attackLink);
          showBrowserNotification('Planète attaquée !', `Attaque de ${event.payload.attackerUsername} sur ${event.payload.targetCoords} — ${event.payload.outcome}`);
        }
        break;
      }
      case 'market-offer-reserved': {
        utils.market.myOffers.invalidate();
        if (isToastEnabled(event.type)) {
          const resLabel: Record<string, string> = { minerai: 'Minerai', silicium: 'Silicium', hydrogene: 'Hydrogène' };
          const resName = resLabel[String(event.payload.resourceType)] ?? event.payload.resourceType;
          const qty = Number(event.payload.quantity).toLocaleString('fr-FR');
          const pName = event.payload.planetName ?? 'votre planète';
          addToast(`Offre acceptée : ${qty} ${resName}. Un cargo est en route vers ${pName}`);
          showBrowserNotification('Offre acceptée', `${qty} ${resName} — cargo en route vers ${pName}`);
        }
        break;
      }
      case 'market-offer-sold':
        utils.market.myOffers.invalidate();
        utils.resource.production.invalidate();
        if (isToastEnabled(event.type)) {
          addToast('Vente finalisée ! Paiement reçu');
          showBrowserNotification('Vente finalisée', `${event.payload.quantity}x ${event.payload.resourceType} vendu`);
        }
        break;
      case 'market-offer-expired':
        utils.market.myOffers.invalidate();
        utils.resource.production.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Offre expirée, ressources restituées (${event.payload.quantity}x ${event.payload.resourceType})`);
          showBrowserNotification('Offre expirée', 'Ressources restituées');
        }
        break;
      case 'daily-quest-completed':
        utils.exilium.getBalance.invalidate();
        utils.dailyQuest.getQuests.invalidate();
        if (isToastEnabled(event.type)) {
          addToast(`Mission completee : ${event.payload.questName}`, 'success');
          showBrowserNotification('Mission completee', `+${event.payload.reward} Exilium`);
        }
        break;
      case 'flagship-incapacitated':
        utils.flagship.get.invalidate();
        if (isToastEnabled(event.type)) {
          addToast('Votre vaisseau amiral a été mis hors service !', 'error', '/flagship');
          showBrowserNotification('Vaisseau amiral détruit !', `Combat en ${event.payload.coords} — réparation en cours`);
        }
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
        if (isToastEnabled(event.type)) {
          addToast(`[${event.payload.allianceTag}] ${event.payload.senderUsername}`);
          showBrowserNotification('Chat Alliance', `${event.payload.senderUsername}: nouveau message`);
        }
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
        if (msg && isToastEnabled(event.type)) {
          addToast(msg, 'info', '/alliance');
          showBrowserNotification('Alliance', msg);
        }
        break;
      }
    }
  });
}
