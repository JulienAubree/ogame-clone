import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { ChevronDown } from 'lucide-react';
import { trpc } from '@/trpc';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';
import { FlagshipNamingModal } from '@/components/flagship/FlagshipNamingModal';

export function TutorialPanel() {
  const { data, isLoading } = trpc.tutorial.getCurrent.useQuery();
  const [minimized, setMinimized] = useState(false);
  const [introSeen, setIntroSeen] = useState(false);
  const [showNamingModal, setShowNamingModal] = useState(false);
  const navigate = useNavigate();

  const utils = trpc.useUtils();

  // Reset introSeen when chapter changes
  const prevChapterRef = useRef(data?.chapter?.id);
  useEffect(() => {
    if (data?.chapter?.id && data.chapter.id !== prevChapterRef.current) {
      setIntroSeen(false);
      prevChapterRef.current = data.chapter.id;
    }
  }, [data?.chapter?.id]);
  const completeQuest = trpc.tutorial.completeQuest.useMutation({
    onSuccess: () => {
      utils.tutorial.getCurrent.invalidate();
      utils.resource.production.invalidate();
      utils.planet.empire.invalidate();
    },
  });

  // State 5: Tutorial complete — render nothing
  if (isLoading || !data || data.isComplete) return null;

  const quest = data.quest;
  const chapter = data.chapter;

  // No quest and no chapter means nothing to show
  if (!quest && !chapter) return null;

  // Chapter info for minimized badge
  const chapterNumber = chapter ? chapter.id.replace('chapter_', '') : '?';
  const completedInChapter = chapter?.completedInChapter ?? 0;
  const questCount = chapter?.questCount ?? 0;

  // State 1: Minimized
  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-16 right-3 z-40 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-card/95 px-3 py-2 text-xs text-amber-400 shadow-lg backdrop-blur-sm transition-colors hover:border-amber-500/50 lg:bottom-4"
      >
        <span className="text-sm">&#9733;</span>
        <span>Ch.{chapterNumber} — {completedInChapter}/{questCount}</span>
      </button>
    );
  }

  // State 2: Chapter intro (new chapter, no quests completed yet, not pending, not seen yet)
  const isChapterIntro = chapter && completedInChapter === 0 && !data.pendingCompletion && quest && !introSeen;
  if (isChapterIntro && chapter) {
    return (
      <div className="fixed bottom-16 left-3 right-3 z-40 max-h-[50vh] overflow-y-auto rounded-lg border border-amber-500/30 bg-card/95 shadow-lg backdrop-blur-sm sm:left-auto sm:w-72 lg:bottom-4 lg:w-80">
        <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-amber-400">&#9733;</span>
            <span className="text-xs font-semibold text-amber-400">
              Chapitre {chapterNumber} : {chapter.title}
            </span>
          </div>
          <button
            onClick={() => setMinimized(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDownIcon />
          </button>
        </div>
        <div className="p-3">
          <p className="border-l-2 border-amber-500/30 pl-3 text-[11px] italic leading-relaxed text-muted-foreground">
            {chapter.journalIntro}
          </p>
          <button
            onClick={() => setIntroSeen(true)}
            className="mt-3 w-full rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30"
          >
            Commencer
          </button>
        </div>
      </div>
    );
  }

  // From here we need an active quest
  if (!quest || !chapter) return null;

  // Interpolate coordinates in journal entry
  let journalEntry = data.journalEntry ?? '';
  if (data.playerCoords) {
    journalEntry = journalEntry
      .replace(/\{galaxy\}/g, String(data.playerCoords.galaxy))
      .replace(/\{system\}/g, String(data.playerCoords.system));
  }

  const { condition, reward } = quest;
  const currentProgress = data.currentProgress;
  const targetValue = data.targetValue;
  const objectiveLabel = data.objectiveLabel ?? quest.objectiveLabel;
  const progressPercent = targetValue > 0 ? Math.min((currentProgress / targetValue) * 100, 100) : 0;
  const chapterProgressPercent = questCount > 0 ? (completedInChapter / questCount) * 100 : 0;
  const isPending = data.pendingCompletion;

  // Action link logic
  const getActionLink = (): { label: string; action: () => void } | null => {
    if (isPending) return null;

    // Special quest handling
    if (quest.id === 'quest_11') return null; // Handled separately with naming modal
    if (quest.id === 'quest_12' && data.playerCoords) {
      const { galaxy, system } = data.playerCoords;
      return {
        label: 'Envoyer la flotte \u2192',
        action: () => navigate(`/fleet/send?galaxy=${galaxy}&system=${system}&position=8&mission=transport`),
      };
    }
    if (quest.id === 'quest_17' && data.playerCoords && data.tutorialMiningMissionId) {
      const { galaxy, system } = data.playerCoords;
      return {
        label: 'Envoyer la flotte \u2192',
        action: () =>
          navigate(
            `/fleet/send?galaxy=${galaxy}&system=${system}&position=8&mission=mine&pveMissionId=${data.tutorialMiningMissionId}`,
          ),
      };
    }

    // Condition-based navigation
    switch (condition.type) {
      case 'building_level':
        return { label: 'Aller aux B\u00e2timents \u2192', action: () => navigate('/buildings') };
      case 'research_level':
        return { label: 'Aller \u00e0 la Recherche \u2192', action: () => navigate('/research') };
      case 'ship_count':
        if (condition.targetId === 'interceptor') {
          return {
            label: 'Aller au Centre de commandement \u2192',
            action: () => navigate('/command-center'),
          };
        }
        return { label: 'Aller au Chantier \u2192', action: () => navigate('/shipyard') };
      case 'defense_count':
        return { label: 'Aller aux D\u00e9fenses \u2192', action: () => navigate('/defense') };
      case 'mission_complete':
        return { label: 'Aller aux Missions \u2192', action: () => navigate('/missions') };
      default:
        return null;
    }
  };

  const actionLink = getActionLink();

  // State 3 & 4: Active quest / Pending completion
  return (
    <div className="fixed bottom-16 left-3 right-3 z-40 max-h-[50vh] overflow-y-auto rounded-lg border border-amber-500/30 bg-card/95 shadow-lg backdrop-blur-sm sm:left-auto sm:w-72 lg:bottom-4 lg:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">&#9733;</span>
          <span className="text-xs font-semibold text-amber-400">
            Chapitre {chapterNumber} : {chapter.title}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {completedInChapter}/{questCount}
          </span>
          <button
            onClick={() => setMinimized(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronDownIcon />
          </button>
        </div>
      </div>

      {/* Chapter progress bar */}
      <div className="px-3 pt-2">
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${chapterProgressPercent}%` }}
          />
        </div>
      </div>

      {/* Quest content */}
      <div className="p-3">
        {/* Journal entry */}
        {journalEntry && (
          <p className="border-l-2 border-amber-500/30 pl-3 text-[11px] italic leading-relaxed text-muted-foreground">
            {journalEntry}
          </p>
        )}

        {/* Objective box */}
        <div className="mt-2 rounded-md bg-background/50 px-2.5 py-2">
          <p className="text-[11px] font-medium text-foreground">{objectiveLabel}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPending ? 'bg-green-500' : 'bg-amber-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {currentProgress}/{targetValue}
            </span>
          </div>
        </div>

        {/* Rewards */}
        <div className="mt-2 flex items-center gap-3 rounded bg-background/50 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">Récompense :</span>
          <div className="flex items-center gap-2 text-[10px]">
            {reward.minerai > 0 && (
              <span className="flex items-center gap-0.5 text-minerai">
                <MineraiIcon size={10} />
                {reward.minerai.toLocaleString()}
              </span>
            )}
            {reward.silicium > 0 && (
              <span className="flex items-center gap-0.5 text-silicium">
                <SiliciumIcon size={10} />
                {reward.silicium.toLocaleString()}
              </span>
            )}
            {reward.hydrogene > 0 && (
              <span className="flex items-center gap-0.5 text-hydrogene">
                <HydrogeneIcon size={10} />
                {reward.hydrogene.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {/* Action link or Suivant button */}
        {isPending ? (
          <button
            onClick={() => completeQuest.mutate()}
            disabled={completeQuest.isPending}
            className="mt-2.5 w-full rounded-md bg-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/30 disabled:opacity-50"
          >
            {completeQuest.isPending ? '...' : 'Suivant \u2192'}
          </button>
        ) : (
          <>
            {actionLink && (
              <button
                onClick={actionLink.action}
                className="mt-2 text-[11px] font-medium text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
              >
                {actionLink.label}
              </button>
            )}
            {quest.id === 'quest_11' && (
              <>
                <button
                  onClick={() => setShowNamingModal(true)}
                  className="mt-2 text-[11px] font-medium text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
                >
                  Nommer votre vaisseau &rarr;
                </button>
                <FlagshipNamingModal
                  open={showNamingModal}
                  onClose={() => setShowNamingModal(false)}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ChevronDownIcon() {
  return <ChevronDown className="h-3.5 w-3.5" />;
}
