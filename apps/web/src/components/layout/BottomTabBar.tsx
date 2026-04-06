import { useLocation, useNavigate } from 'react-router';
import {
  OverviewIcon,
  ResourcesIcon,
  BuildingsIcon,
  ResearchIcon,
  ShipyardIcon,
  CommandCenterIcon,
  DefenseIcon,
  FleetIcon,
  GalaxyIcon,
  MarketIcon,
  MissionsIcon,
  MessagesIcon,
  RankingIcon,
  AllianceIcon,
  AllianceRankingIcon,
  FlagshipIcon,
  EmpireIcon,
} from '@/lib/icons';
import { useUIStore } from '@/stores/ui.store';
import { trpc } from '@/trpc';
import { BottomSheet } from './BottomSheet';

const TAB_GROUPS = {
  empire: ['/empire'],
  planete: ['/', '/energy', '/buildings', '/research'],
  production: ['/shipyard', '/command-center', '/defense'],
  espace: ['/galaxy', '/fleet', '/missions', '/market', '/flagship'],
  social: ['/messages', '/alliance', '/ranking', '/alliance-ranking'],
};

type TabGroup = keyof typeof TAB_GROUPS;

const SHEET_ITEMS = {
  empire: [
    { label: 'Empire', path: '/empire', icon: EmpireIcon },
  ],
  planete: [
    { label: "Vue d'ensemble", path: '/', icon: OverviewIcon },
    { label: 'Énergie', path: '/energy', icon: ResourcesIcon },
    { label: 'Bâtiments', path: '/buildings', icon: BuildingsIcon },
    { label: 'Recherche', path: '/research', icon: ResearchIcon },
  ],
  production: [
    { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
    { label: 'Centre de commandement', path: '/command-center', icon: CommandCenterIcon },
    { label: 'Défense', path: '/defense', icon: DefenseIcon },
  ],
  espace: [
    { label: 'Galaxie', path: '/galaxy', icon: GalaxyIcon },
    { label: 'Flotte', path: '/fleet', icon: FleetIcon },
    { label: 'Missions', path: '/missions', icon: MissionsIcon },
    { label: 'Marché', path: '/market', icon: MarketIcon },
    { label: 'Vaisseau amiral', path: '/flagship', icon: FlagshipIcon },
  ],
  social: [
    { label: 'Messages', path: '/messages', icon: MessagesIcon },
    { label: 'Alliance', path: '/alliance', icon: AllianceIcon },
    { label: 'Classement', path: '/ranking', icon: RankingIcon },
    { label: 'Classement Alliances', path: '/alliance-ranking', icon: AllianceRankingIcon },
  ],
};

function getActiveTab(pathname: string): TabGroup | null {
  for (const [group, paths] of Object.entries(TAB_GROUPS)) {
    if (group === 'planete' && pathname === '/') return 'planete';
    if (group !== 'planete' && (paths as readonly string[]).some((p) => pathname.startsWith(p))) {
      return group as TabGroup;
    }
  }
  // Check planete non-root paths
  if ((TAB_GROUPS.planete as readonly string[]).some((p) => p !== '/' && pathname.startsWith(p))) {
    return 'planete';
  }
  return null;
}

export function BottomTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSheet, toggleSheet, closeSheet } = useUIStore();
  const { data: unreadCount } = trpc.message.unreadCount.useQuery();
  const activeTab = getActiveTab(location.pathname);

  const handleSheetNav = (path: string) => {
    navigate(path);
    closeSheet();
  };

  const tabs = [
    { id: 'empire' as const, label: 'Empire', icon: EmpireIcon, action: () => navigate('/empire') },
    { id: 'planete' as const, label: 'Planète', icon: OverviewIcon, action: () => toggleSheet('planete') },
    { id: 'production' as const, label: 'Production', icon: ShipyardIcon, action: () => toggleSheet('production') },
    { id: 'espace' as const, label: 'Espace', icon: GalaxyIcon, action: () => toggleSheet('espace') },
    { id: 'social' as const, label: 'Social', icon: MessagesIcon, action: () => toggleSheet('social'), badge: unreadCount ?? 0 },
  ];

  return (
    <>
      {activeSheet && (
        <BottomSheet open onClose={closeSheet}>
          <nav className="flex flex-col gap-1">
            {SHEET_ITEMS[activeSheet]?.map((item) => (
              <button
                key={item.path}
                onClick={() => handleSheetNav(item.path)}
                className={`flex items-center gap-3 rounded-lg p-4 text-left touch-feedback transition-colors ${
                  location.pathname === item.path
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                }`}
              >
                <item.icon width={22} height={22} />
                <span className="text-base font-medium">{item.label}</span>
              </button>
            ))}
          </nav>
        </BottomSheet>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-white/10 bg-card backdrop-blur-lg pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] lg:hidden">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab || tab.id === activeSheet;
          return (
            <button
              key={tab.id}
              onClick={tab.action}
              className={`flex flex-1 flex-col items-center justify-center gap-1 py-2 touch-feedback transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className="relative">
                <tab.icon width={24} height={24} />
                {'badge' in tab && (tab as any).badge > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                    {(tab as any).badge}
                  </span>
                )}
              </div>
              <span className="text-xs font-medium">{tab.label}</span>
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
