import { useState } from 'react';
import { useNavigate } from 'react-router';
import { trpc } from '@/trpc';
import { MineraiIcon, SiliciumIcon, HydrogeneIcon } from '@/components/common/ResourceIcons';

export function TutorialPanel() {
  const { data, isLoading } = trpc.tutorial.getCurrent.useQuery();
  const [minimized, setMinimized] = useState(false);
  const navigate = useNavigate();

  if (isLoading || !data || data.isComplete || !data.quest) return null;

  const quest = data.quest;
  const completedCount = (data.completedQuests as { questId: string }[]).length;
  const totalQuests = 16;
  const progressPercent = (completedCount / totalQuests) * 100;

  // Interpolate coordinates in narrative text
  let narrativeText = quest.narrativeText;
  if (data.playerCoords) {
    narrativeText = narrativeText
      .replace(/\{galaxy\}/g, String(data.playerCoords.galaxy))
      .replace(/\{system\}/g, String(data.playerCoords.system));
  }

  // Fleet link for quests 12 (transport) and 15 (mine)
  const getFleetLink = () => {
    if (!data.playerCoords) return null;
    const { galaxy, system } = data.playerCoords;
    if (quest.id === 'quest_12') {
      return `/fleet?galaxy=${galaxy}&system=${system}&position=8&mission=transport`;
    }
    if (quest.id === 'quest_15' && data.tutorialMiningMissionId) {
      return `/fleet?galaxy=${galaxy}&system=${system}&position=8&mission=mine&pveMissionId=${data.tutorialMiningMissionId}`;
    }
    return null;
  };
  const fleetLink = getFleetLink();

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-16 right-3 z-40 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-card/95 px-3 py-2 text-xs text-amber-400 shadow-lg backdrop-blur-sm transition-colors hover:border-amber-500/50 lg:bottom-4"
      >
        <span className="text-sm">&#9733;</span>
        <span>Quête {completedCount + 1}/{totalQuests}</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-16 right-3 z-40 w-72 rounded-lg border border-amber-500/30 bg-card/95 shadow-lg backdrop-blur-sm lg:bottom-4 lg:w-80">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-amber-400">&#9733;</span>
          <span className="text-xs font-semibold text-amber-400">Conseiller</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{completedCount}/{totalQuests}</span>
          <button
            onClick={() => setMinimized(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-3 pt-2">
        <div className="h-1 overflow-hidden rounded-full bg-border/50">
          <div
            className="h-full rounded-full bg-amber-500 transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Quest content */}
      <div className="p-3">
        <h4 className="text-xs font-semibold text-foreground">
          {quest.title}
        </h4>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground italic">
          "{narrativeText}"
        </p>
        {fleetLink && (
          <button
            onClick={() => navigate(fleetLink)}
            className="mt-1.5 text-[11px] font-medium text-amber-400 underline underline-offset-2 transition-colors hover:text-amber-300"
          >
            Envoyer la flotte &rarr;
          </button>
        )}

        {/* Reward preview */}
        <div className="mt-2 flex items-center gap-3 rounded bg-background/50 px-2 py-1.5">
          <span className="text-[10px] text-muted-foreground">Récompense :</span>
          <div className="flex items-center gap-2 text-[10px]">
            {quest.reward.minerai > 0 && (
              <span className="flex items-center gap-0.5 text-minerai">
                <MineraiIcon size={10} />
                {quest.reward.minerai.toLocaleString()}
              </span>
            )}
            {quest.reward.silicium > 0 && (
              <span className="flex items-center gap-0.5 text-silicium">
                <SiliciumIcon size={10} />
                {quest.reward.silicium.toLocaleString()}
              </span>
            )}
            {quest.reward.hydrogene > 0 && (
              <span className="flex items-center gap-0.5 text-hydrogene">
                <HydrogeneIcon size={10} />
                {quest.reward.hydrogene.toLocaleString()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
