import { useLocation, useNavigate } from 'react-router';
import {
  OverviewIcon,
  BuildingsIcon,
  GalaxyIcon,
  AllianceIcon,
  MoreIcon,
  ResourcesIcon,
  ResearchIcon,
  ShipyardIcon,
  CommandCenterIcon,
  DefenseIcon,
  FleetIcon,
  MovementsIcon,
  MissionsIcon,
  MessagesIcon,
  ReportsIcon,
  RankingIcon,
  HistoryIcon,
  ProfileIcon,
} from '@/lib/icons';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePlanetStore } from '@/stores/planet.store';
import { trpc } from '@/trpc';
import { BottomSheet } from './BottomSheet';

const TAB_GROUPS = {
  accueil: ['/'],
  base: ['/resources', '/buildings', '/research', '/shipyard', '/command-center', '/defense'],
  galaxie: ['/galaxy', '/fleet', '/missions', '/movements'],
  social: ['/profile', '/messages', '/reports', '/alliance', '/ranking', '/alliance-ranking'],
};

type TabGroup = keyof typeof TAB_GROUPS;

const SHEET_ITEMS = {
  base: [
    { label: 'Ressources', path: '/resources', icon: ResourcesIcon },
    { label: 'Bâtiments', path: '/buildings', icon: BuildingsIcon },
    { label: 'Recherche', path: '/research', icon: ResearchIcon },
    { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
    { label: 'Centre de commandement', path: '/command-center', icon: CommandCenterIcon },
    { label: 'Défense', path: '/defense', icon: DefenseIcon },
  ],
  galaxie: [
    { label: 'Vue galaxie', path: '/galaxy', icon: GalaxyIcon },
    { label: 'Envoyer une flotte', path: '/fleet', icon: FleetIcon },
    { label: 'Missions', path: '/missions', icon: MissionsIcon },
    { label: 'Mouvements', path: '/movements', icon: MovementsIcon },
  ],
  social: [
    { label: 'Profil', path: '/profile', icon: ProfileIcon },
    { label: 'Messages', path: '/messages', icon: MessagesIcon },
    { label: 'Rapports', path: '/reports', icon: ReportsIcon },
    { label: 'Alliance', path: '/alliance', icon: AllianceIcon },
    { label: 'Classement', path: '/ranking', icon: RankingIcon },
  ],
};

function getActiveTab(pathname: string): TabGroup | null {
  if (pathname === '/') return 'accueil';
  for (const [group, paths] of Object.entries(TAB_GROUPS)) {
    if (group === 'accueil') continue;
    if ((paths as readonly string[]).some((p) => pathname.startsWith(p))) {
      return group as TabGroup;
    }
  }
  return null;
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSheet, toggleSheet, closeSheet } = useUIStore();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const clearActivePlanet = usePlanetStore((s) => s.clearActivePlanet);
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const activeTab = getActiveTab(location.pathname);

  const handleSheetNav = (path: string) => {
    navigate(path);
    closeSheet();
  };

  const tabs = [
    { id: 'accueil' as const, label: 'Accueil', icon: OverviewIcon, action: () => { closeSheet(); navigate('/'); } },
    { id: 'base' as const, label: 'Base', icon: BuildingsIcon, action: () => toggleSheet('base') },
    { id: 'galaxie' as const, label: 'Galaxie', icon: GalaxyIcon, action: () => toggleSheet('galaxie') },
    { id: 'social' as const, label: 'Social', icon: AllianceIcon, action: () => toggleSheet('social'), badge: unreadCount ?? 0 },
    { id: 'plus' as const, label: 'Plus', icon: MoreIcon, action: () => toggleSheet('plus') },
  ];

  return (
    <>
      {activeSheet && activeSheet !== 'plus' && (
        <BottomSheet open onClose={closeSheet}>
          <nav className="flex flex-col gap-1">
            {SHEET_ITEMS[activeSheet as keyof typeof SHEET_ITEMS]?.map((item) => (
              <button
                key={item.path}
                onClick={() => handleSheetNav(item.path)}
                className={`flex items-center gap-3 rounded-lg p-3 text-left transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon width={20} height={20} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </BottomSheet>
      )}

      {activeSheet === 'plus' && (
        <BottomSheet open onClose={closeSheet}>
          <nav className="flex flex-col gap-1">
            <button
              onClick={() => handleSheetNav('/history')}
              className="flex items-center gap-3 rounded-lg p-3 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HistoryIcon width={20} height={20} />
              <span className="text-sm font-medium">Historique</span>
            </button>
            <button
              onClick={() => { closeSheet(); clearActivePlanet(); clearAuth(); }}
              className="flex items-center gap-3 rounded-lg p-3 text-left text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <span className="text-sm font-medium">Déconnexion</span>
            </button>
          </nav>
        </BottomSheet>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-14 items-center justify-around border-t border-white/10 bg-card/95 backdrop-blur-lg lg:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab || tab.id === activeSheet;
          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 py-1 transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative">
                <tab.icon width={22} height={22} />
                {'badge' in tab && (tab as any).badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {(tab as any).badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
              {isActive && (
                <div className="absolute bottom-0 h-0.5 w-8 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--accent-glow))]" />
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
}
