import type { ComponentType, SVGProps } from 'react';
import { cn } from '@/lib/utils';
import { RoleAllIcon, RoleTransportIcon, RoleUtilityIcon } from './role-icons';

export type ShipyardFilter = 'all' | 'ship_transport' | 'ship_utilitaire';

interface ShipyardRoleFilterProps {
  value: ShipyardFilter;
  onChange: (value: ShipyardFilter) => void;
}

const FILTERS: { key: ShipyardFilter; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: 'all', label: 'Tout', Icon: RoleAllIcon },
  { key: 'ship_transport', label: 'Transport', Icon: RoleTransportIcon },
  { key: 'ship_utilitaire', label: 'Utilitaire', Icon: RoleUtilityIcon },
];

export function ShipyardRoleFilter({ value, onChange }: ShipyardRoleFilterProps) {
  return (
    <div className="flex gap-0.5 bg-card/30 rounded-lg p-0.5 border border-border/20 w-fit">
      {FILTERS.map(({ key, label, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5',
            value === key
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
