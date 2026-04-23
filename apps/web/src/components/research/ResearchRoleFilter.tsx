import { cn } from '@/lib/utils';
import { ResearchAllIcon, RESEARCH_CATEGORIES, type ResearchCategoryId } from './research-icons';

export type ResearchFilter = 'all' | ResearchCategoryId;

interface ResearchRoleFilterProps {
  value: ResearchFilter;
  onChange: (value: ResearchFilter) => void;
  availableCategories: ResearchCategoryId[];
}

export function ResearchRoleFilter({ value, onChange, availableCategories }: ResearchRoleFilterProps) {
  const visible = RESEARCH_CATEGORIES.filter((c) => availableCategories.includes(c.id));

  return (
    <div className="flex flex-wrap gap-0.5 bg-card/30 rounded-lg p-0.5 border border-border/20">
      <button
        type="button"
        onClick={() => onChange('all')}
        className={cn(
          'px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5',
          value === 'all' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <ResearchAllIcon className="h-3.5 w-3.5" />
        Tout
      </button>
      {visible.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors inline-flex items-center gap-1.5',
            value === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
