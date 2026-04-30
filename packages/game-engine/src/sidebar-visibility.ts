export type SidebarContext = {
  /** Order of current tutorial chapter (1 to 4). If tutorial is complete, pass 4. */
  chapterOrder: number;
  /** True when tutorial progress has isComplete. */
  isComplete: boolean;
  /** Number of colonies owned by the player. */
  colonyCount: number;
};

export type SidebarVisibilityRule = (ctx: SidebarContext) => boolean;

const always: SidebarVisibilityRule = () => true;
const atChapter = (n: number): SidebarVisibilityRule => (ctx) => ctx.chapterOrder >= n;
const afterTutorial: SidebarVisibilityRule = (ctx) => ctx.isComplete;
const afterTutorialWithColonies = (min: number): SidebarVisibilityRule =>
  (ctx) => ctx.isComplete && ctx.colonyCount >= min;

/** Source of truth: path → visibility rule. Order reflects the sidebar layout. */
export const SIDEBAR_VISIBILITY_RULES = {
  '/empire': afterTutorialWithColonies(2),
  '/research': atChapter(2),
  '/flagship': atChapter(3),
  '/': always,
  '/energy': always,
  '/resources': always,
  '/infrastructures': always,
  '/shipyard': atChapter(2),
  '/command-center': atChapter(4),
  '/defense': atChapter(4),
  '/galaxy': atChapter(3),
  '/fleet': atChapter(3),
  '/missions': atChapter(3),
  '/anomalies': atChapter(4),
  '/market': afterTutorial,
  '/messages': always,
  '/alliance': afterTutorial,
  '/ranking': afterTutorial,
  '/alliance-ranking': afterTutorial,
  '/changelog': always,
  '/feedback': always,
} as const satisfies Record<string, SidebarVisibilityRule>;

export type SidebarPath = keyof typeof SIDEBAR_VISIBILITY_RULES;

export const ALWAYS_VISIBLE_PATHS: readonly SidebarPath[] = (
  Object.entries(SIDEBAR_VISIBILITY_RULES) as [SidebarPath, SidebarVisibilityRule][]
)
  .filter(([, rule]) => rule === always)
  .map(([path]) => path);

export function getVisibleSidebarPaths(ctx: SidebarContext): Set<SidebarPath> {
  const visible = new Set<SidebarPath>();
  for (const [path, rule] of Object.entries(SIDEBAR_VISIBILITY_RULES) as [SidebarPath, SidebarVisibilityRule][]) {
    if (rule(ctx)) visible.add(path);
  }
  return visible;
}
