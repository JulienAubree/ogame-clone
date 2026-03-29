import { NavLink } from 'react-router';
import { cn } from '@/lib/utils';
import { MessageSquarePlus } from 'lucide-react';
import {
  OverviewIcon,
  ResourcesIcon,
  BuildingsIcon,
  ResearchIcon,
  ShipyardIcon,
  CommandCenterIcon,
  DefenseIcon,
  FleetIcon,
  FlagshipIcon,
  GalaxyIcon,
  MarketIcon,
  MissionsIcon,
  MessagesIcon,
  RankingIcon,
  AllianceIcon,
  AllianceRankingIcon,
} from '@/lib/icons';

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}

const sections: { title: string; items: NavItem[] }[] = [
  {
    title: 'Planète',
    items: [
      { label: "Vue d'ensemble", path: '/', icon: OverviewIcon },
      { label: 'Ressources', path: '/resources', icon: ResourcesIcon },
      { label: 'Bâtiments', path: '/buildings', icon: BuildingsIcon },
      { label: 'Recherche', path: '/research', icon: ResearchIcon },
    ],
  },
  {
    title: 'Production',
    items: [
      { label: 'Chantier spatial', path: '/shipyard', icon: ShipyardIcon },
      { label: 'Centre de commandement', path: '/command-center', icon: CommandCenterIcon },
      { label: 'Défense', path: '/defense', icon: DefenseIcon },
    ],
  },
  {
    title: 'Espace',
    items: [
      { label: 'Galaxie', path: '/galaxy', icon: GalaxyIcon },
      { label: 'Flotte', path: '/fleet', icon: FleetIcon },
      { label: 'Vaisseau amiral', path: '/flagship', icon: FlagshipIcon },
      { label: 'Missions', path: '/missions', icon: MissionsIcon },
      { label: 'Marché', path: '/market', icon: MarketIcon },
    ],
  },
  {
    title: 'Communauté',
    items: [
      { label: 'Messages', path: '/messages', icon: MessagesIcon },
      { label: 'Alliance', path: '/alliance', icon: AllianceIcon },
      { label: 'Classement', path: '/ranking', icon: RankingIcon },
      { label: 'Classement Alliances', path: '/alliance-ranking', icon: AllianceRankingIcon },
      { label: 'Feedback', path: '/feedback', icon: MessageSquarePlus as any },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:w-56 lg:flex-col bg-card/80 backdrop-blur-md border-r border-white/10">
      <div className="flex h-14 items-center border-b border-border/50 px-4">
        <span className="text-lg font-bold text-primary glow-silicium">Exilium</span>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {sections.map((section, idx) => (
          <div key={section.title}>
            {idx > 0 && <div className="mx-3 my-2 border-t border-border/30" />}
            <p className="mb-1 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'border-l-2 border-primary bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )
                    }
                  >
                    <item.icon width={18} height={18} />
                    <span>{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
