# Onboarding TopBar Rework

## Summary

Replace the floating tutorial panel with a TopBar dropdown. During onboarding, the Exilium icon is replaced by a star icon that opens the quest tracker. After onboarding, it switches to Exilium + daily quests. Daily quests are blocked until onboarding is complete.

## TopBar: Contextual Icon

### During onboarding (isComplete === false)
- Star icon (amber) replaces Exilium icon
- Badge shows chapter progress (e.g., "3/6")
- Click opens onboarding dropdown
- No Exilium balance displayed

### After onboarding (isComplete === true)
- Exilium icon (violet) + balance (current behavior)
- Click opens daily quest dropdown
- No changes to current behavior

Switch is automatic based on `trpc.tutorial.getCurrent` returning `isComplete`.

## Onboarding Dropdown Content

Same content as current TutorialPanel, displayed as a dropdown from TopBar:

1. **Header**: "Chapitre N : Title" + progress counter (completed/total) + close button
2. **Chapter progress bar**: colored bar showing completion within chapter
3. **Chapter intro** (when new chapter, not yet seen): journal intro text + "Commencer" button
4. **Active quest**:
   - Journal entry (narrative italic text with amber left border)
   - Objective box with label + progress bar + counter
   - Rewards display (minerai/silicium/hydrogene icons)
5. **Action button**:
   - When quest in progress: context link ("Aller aux Batiments →", etc.)
   - When quest complete (pendingCompletion): "Suivant →" button
   - Special case quest_11: "Nommer votre vaisseau →" opens FlagshipNamingModal

## Remove TutorialPanel

- Remove `TutorialPanel` component from Layout
- Delete or keep the file (no longer rendered)
- The TopBar dropdown replaces it entirely

## Block Daily Quests During Onboarding

In `daily-quest.service.ts getQuests()`:
- Check if tutorial is complete for the user
- If `isComplete === false`: return empty state (no quest generation)
- This requires access to tutorial progress in the daily quest service

Implementation: query `tutorialProgress` table for `isComplete` before generating quests.

## Files to Modify

- `apps/web/src/components/layout/TopBar.tsx` — contextual icon + onboarding dropdown
- `apps/web/src/components/layout/Layout.tsx` — remove TutorialPanel render
- `apps/api/src/modules/daily-quest/daily-quest.service.ts` — block quests during onboarding
- `apps/web/src/components/tutorial/TutorialPanel.tsx` — can be deleted or kept unused

## Out of Scope

- Changes to tutorial quest definitions
- Changes to daily quest definitions
- Changes to Exilium economy
