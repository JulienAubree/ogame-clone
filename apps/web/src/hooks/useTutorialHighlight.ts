import { trpc } from '@/trpc';

/**
 * Returns true if the given item should be highlighted as the current tutorial objective.
 */
export function useTutorialHighlight(itemId: string): boolean {
  const { data } = trpc.tutorial.getCurrent.useQuery();

  if (!data || data.isComplete || !data.quest || data.pendingCompletion) return false;

  const { condition } = data.quest;
  const highlightTypes = ['building_level', 'research_level', 'ship_count', 'defense_count'];

  if (!highlightTypes.includes(condition.type)) return false;

  return condition.targetId === itemId;
}

/**
 * Returns the target ID that should be highlighted, or null.
 * Safe to call once at component top-level then compare in loops.
 */
export function useTutorialTargetId(): string | null {
  const { data } = trpc.tutorial.getCurrent.useQuery();

  if (!data || data.isComplete || !data.quest || data.pendingCompletion) return null;

  const { condition } = data.quest;
  const highlightTypes = ['building_level', 'research_level', 'ship_count', 'defense_count'];

  if (!highlightTypes.includes(condition.type)) return null;

  return condition.targetId;
}
