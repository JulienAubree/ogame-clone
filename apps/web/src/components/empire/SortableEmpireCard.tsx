import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { EmpirePlanetCard } from './EmpirePlanetCard';
import { ChevronUp, ChevronDown, GripVertical } from 'lucide-react';

type EmpirePlanet = Parameters<typeof EmpirePlanetCard>[0]['planet'];

interface SortableEmpireCardProps {
  planet: EmpirePlanet;
  isFirst: boolean;
  isReordering: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirstInList?: boolean;
  isLastInList?: boolean;
}

export function SortableEmpireCard({
  planet,
  isFirst,
  isReordering,
  onMoveUp,
  onMoveDown,
  isFirstInList,
  isLastInList,
}: SortableEmpireCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: planet.id, disabled: !isReordering });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  if (!isReordering) {
    return <EmpirePlanetCard planet={planet} isFirst={isFirst} />;
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        isDragging && 'z-50 opacity-30',
      )}
    >
      {/* Drag handle -- desktop only, wider touch target */}
      <div
        className="absolute left-2 top-2 z-10 hidden cursor-grab rounded-md border border-border/50 bg-card/90 px-2 py-1.5 backdrop-blur-sm active:cursor-grabbing lg:flex"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </div>

      {/* Mobile arrow buttons */}
      <div className="absolute right-2 top-2 z-10 flex flex-col gap-1 lg:hidden">
        <button
          type="button"
          disabled={isFirstInList}
          onClick={onMoveUp}
          className={cn(
            'flex items-center justify-center rounded-md border border-border/50 bg-card/90 p-1.5 backdrop-blur-sm transition-colors',
            isFirstInList ? 'opacity-30' : 'hover:bg-accent/50 active:bg-accent',
          )}
        >
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          disabled={isLastInList}
          onClick={onMoveDown}
          className={cn(
            'flex items-center justify-center rounded-md border border-border/50 bg-card/90 p-1.5 backdrop-blur-sm transition-colors',
            isLastInList ? 'opacity-30' : 'hover:bg-accent/50 active:bg-accent',
          )}
        >
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </div>

      {/* Card content with navigation hidden */}
      <div className="pointer-events-none select-none [&_button]:pointer-events-none">
        <EmpirePlanetCard planet={planet} isFirst={isFirst} />
      </div>
    </div>
  );
}
