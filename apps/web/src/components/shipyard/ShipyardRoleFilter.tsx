import { cn } from '@/lib/utils';
import { RoleAllIcon, SHIPYARD_ROLES, type ShipyardRoleId } from './role-icons';

export type ShipyardFilter = 'all' | ShipyardRoleId;

interface ShipyardRoleFilterProps {
  value: ShipyardFilter;
  onChange: (value: ShipyardFilter) => void;
  availableRoles: ShipyardRoleId[];
}

export function ShipyardRoleFilter({ value, onChange, availableRoles }: ShipyardRoleFilterProps) {
  const visibleRoles = SHIPYARD_ROLES.filter((r) => availableRoles.includes(r.id));

  return (
    <div className="flex flex-wrap gap-0.5 bg-card/30 rounded-lg p-0.5 border border-border/20">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5',
          value === 'all'
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <RoleAllIcon className="h-3.5 w-3.5" />
        Tout
      </button>
      {visibleRoles.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5',
            value === id
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
