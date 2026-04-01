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
