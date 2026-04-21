# Profile Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify `/profile` and `/player/:userId` into a single cinematic single-column page with a hero banner, resource-icon stats, inline-edit bio, alliance card, and split own/other social zone.

**Architecture:** One orchestrator (`ProfileView`) composes six new cards plus a shared `AllianceTagBadge` primitive. Both page files become thin wrappers. Backend gets two tiny additions: alliance tag/id/role in stats, `createdAt` in the other-player payload. Notifications move out of the profile page entirely into `/settings/notifications`.

**Tech Stack:** React + TypeScript + Tailwind, tRPC (existing endpoints), Drizzle (two column selections extended), inline SVGs.

**Spec:** [`docs/superpowers/specs/2026-04-21-profile-page-redesign-design.md`](../specs/2026-04-21-profile-page-redesign-design.md)

**Dependency map (for parallelism):**
- Task 1 (backend payload) is a prereq for Tasks 3, 4, 6, 9
- Task 2 (`AllianceTagBadge`) is a prereq for Tasks 3 and 6
- Task 11 (SettingsNotifications page) is fully independent
- Wave 1 (parallel): Tasks 1, 2, 11
- Wave 2 (parallel, after Wave 1): Tasks 3, 4, 5, 6, 7, 8
- Wave 3 (serial, after Wave 2): Task 9 (ProfileView orchestrator)
- Wave 4 (serial, after Wave 3): Task 10 (page wrappers)
- Task 12 (manual verification) runs last

---

## Task 1: Backend — extend `getPlayerStats` and `getProfile` payloads

**Files:**
- Modify: `apps/api/src/modules/user/user.service.ts`

- [ ] **Step 1: Replace `getPlayerStats` (around line 110)**

Find the existing function:

```ts
async getPlayerStats(userId: string) {
  const [ranking] = await db.select({
    rank: rankings.rank,
    totalPoints: rankings.totalPoints,
  }).from(rankings).where(eq(rankings.userId, userId)).limit(1);

  const [planetCount] = await db.select({
    count: count(),
  }).from(planets).where(eq(planets.userId, userId));

  const [membership] = await db.select({
    allianceName: alliances.name,
  }).from(allianceMembers)
    .innerJoin(alliances, eq(allianceMembers.allianceId, alliances.id))
    .where(eq(allianceMembers.userId, userId))
    .limit(1);

  return {
    rank: ranking?.rank ?? null,
    totalPoints: ranking?.totalPoints ?? 0,
    planetCount: planetCount?.count ?? 0,
    allianceName: membership?.allianceName ?? null,
  };
},
```

Replace with:

```ts
async getPlayerStats(userId: string) {
  const [ranking] = await db.select({
    rank: rankings.rank,
    totalPoints: rankings.totalPoints,
  }).from(rankings).where(eq(rankings.userId, userId)).limit(1);

  const [planetCount] = await db.select({
    count: count(),
  }).from(planets).where(eq(planets.userId, userId));

  const [membership] = await db.select({
    allianceName: alliances.name,
    allianceTag: alliances.tag,
    allianceId: alliances.id,
    allianceRole: allianceMembers.role,
  }).from(allianceMembers)
    .innerJoin(alliances, eq(allianceMembers.allianceId, alliances.id))
    .where(eq(allianceMembers.userId, userId))
    .limit(1);

  return {
    rank: ranking?.rank ?? null,
    totalPoints: ranking?.totalPoints ?? 0,
    planetCount: planetCount?.count ?? 0,
    allianceName: membership?.allianceName ?? null,
    allianceTag: membership?.allianceTag ?? null,
    allianceId: membership?.allianceId ?? null,
    allianceRole: membership?.allianceRole ?? null,
  };
},
```

- [ ] **Step 2: Extend `getProfile` return value (around line 57)**

Find the existing return in `getProfile(userId, currentUserId)`:

```ts
return {
  id: user.id,
  username: user.username,
  avatarId: user.avatarId,
  bio: (visibility.bio !== false) ? user.bio : null,
  playstyle: (visibility.playstyle !== false) ? user.playstyle : null,
  seekingAlliance: (visibility.playstyle !== false) ? user.seekingAlliance : null, // grouped with playstyle visibility
  stats: (visibility.stats !== false) ? stats : null,
  friendshipStatus: friendship.status,
  friendshipId: friendship.friendshipId,
};
```

Replace with:

```ts
return {
  id: user.id,
  username: user.username,
  avatarId: user.avatarId,
  createdAt: user.createdAt,
  bio: (visibility.bio !== false) ? user.bio : null,
  playstyle: (visibility.playstyle !== false) ? user.playstyle : null,
  seekingAlliance: (visibility.playstyle !== false) ? user.seekingAlliance : null, // grouped with playstyle visibility
  stats: (visibility.stats !== false) ? stats : null,
  friendshipStatus: friendship.status,
  friendshipId: friendship.friendshipId,
};
```

- [ ] **Step 3: Typecheck API and web**

Run: `pnpm -F @exilium/api typecheck && pnpm -F @exilium/web typecheck`
Expected: both pass with no errors. (The web side may already consume these new fields via tRPC type inference — that's fine.)

- [ ] **Step 4: Commit and push**

```bash
git add apps/api/src/modules/user/user.service.ts
git commit -m "feat(api): extend user profile payload with alliance tag/id/role and createdAt

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 2: `AllianceTagBadge` shared primitive

**Files:**
- Create: `apps/web/src/components/profile/AllianceTagBadge.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { cn } from '@/lib/utils';

type Size = 'sm' | 'md' | 'lg';

interface AllianceTagBadgeProps {
  tag: string;
  size?: Size;
  className?: string;
}

const SIZE_STYLES: Record<Size, { box: string; text: string; maxChars: number }> = {
  sm: { box: 'w-7 h-8', text: 'text-[10px]', maxChars: 2 },
  md: { box: 'w-10 h-11', text: 'text-xs', maxChars: 3 },
  lg: { box: 'w-12 h-14', text: 'text-sm', maxChars: 3 },
};

export function AllianceTagBadge({ tag, size = 'md', className }: AllianceTagBadgeProps) {
  const styles = SIZE_STYLES[size];
  const label = tag.slice(0, styles.maxChars).toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-slate-900/70 border border-amber-500/40',
        styles.box,
        className,
      )}
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 75%, 50% 100%, 0 75%)' }}
      title={tag}
    >
      <span className={cn('font-bold text-amber-400 tracking-wider', styles.text)}>{label}</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/AllianceTagBadge.tsx
git commit -m "feat(profile): AllianceTagBadge shared primitive

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 3: `ProfileHero` component

Requires Task 1 (for `allianceTag`) and Task 2 (for `AllianceTagBadge`).

**Files:**
- Create: `apps/web/src/components/profile/ProfileHero.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { AllianceTagBadge } from './AllianceTagBadge';

const PLAYSTYLE_LABELS: Record<string, string> = {
  miner: 'Mineur',
  warrior: 'Guerrier',
  explorer: 'Explorateur',
};

interface ProfileHeroProps {
  username: string;
  avatarId: string | null;
  rank: number | null;
  bio: string | null;
  createdAt: string | Date;
  playstyle: 'miner' | 'warrior' | 'explorer' | null;
  seekingAlliance: boolean | null;
  allianceTag: string | null;
  onEditAvatar?: () => void;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function AvatarFallback({ username }: { username: string }) {
  return (
    <span className="text-2xl font-bold text-white/90">
      {username.slice(0, 2).toUpperCase()}
    </span>
  );
}

function formatJoinMonth(createdAt: string | Date): string {
  const d = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(d);
}

function tagline(bio: string | null, createdAt: string | Date): string {
  if (bio && bio.trim().length > 0) {
    const firstLine = bio.split('\n')[0].trim();
    return firstLine.length > 90 ? firstLine.slice(0, 87) + '…' : firstLine;
  }
  return `Aux commandes depuis ${formatJoinMonth(createdAt)}`;
}

export function ProfileHero({
  username,
  avatarId,
  rank,
  bio,
  createdAt,
  playstyle,
  seekingAlliance,
  allianceTag,
  onEditAvatar,
}: ProfileHeroProps) {
  const phrase = tagline(bio, createdAt);
  const rankLine = rank != null ? `Capitaine · Rang ${rank}` : 'Capitaine';

  const avatar: ReactNode = avatarId ? (
    <img
      src={`/assets/avatars/${avatarId}.webp`}
      alt={username}
      className="w-full h-full object-cover"
    />
  ) : (
    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-700 to-cyan-600">
      <AvatarFallback username={username} />
    </div>
  );

  return (
    <div
      className="relative overflow-hidden rounded-lg border border-slate-500/30 px-5 py-5"
      style={{ background: 'linear-gradient(180deg, #020617 0%, #1e1b4b 100%)', minHeight: '160px' }}
    >
      {/* Stars layer */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage: [
            'radial-gradient(1px 1px at 15% 20%, white, transparent)',
            'radial-gradient(1px 1px at 70% 40%, white, transparent)',
            'radial-gradient(1px 1px at 30% 70%, white, transparent)',
            'radial-gradient(1px 1px at 85% 80%, white, transparent)',
            'radial-gradient(1.5px 1.5px at 50% 15%, #fbbf24, transparent)',
          ].join(','),
        }}
      />

      {/* Distant planet */}
      <div
        className="pointer-events-none absolute opacity-80"
        style={{
          right: '-30px',
          top: '-10px',
          width: '90px',
          height: '90px',
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, #86efac 0%, #16a34a 50%, #052e16 100%)',
        }}
      />

      {/* Alliance monogram (top-right corner) */}
      {allianceTag && (
        <div className="absolute top-3 right-3">
          <AllianceTagBadge tag={allianceTag} size="sm" />
        </div>
      )}

      {/* Content row */}
      <div className="relative flex items-center gap-4">
        {/* Avatar with optional edit pencil */}
        <div className="relative group shrink-0">
          <div
            className={cn(
              'w-[90px] h-[90px] rounded-full overflow-hidden border-2 border-slate-400/40',
              onEditAvatar && 'cursor-pointer',
            )}
            onClick={onEditAvatar}
            role={onEditAvatar ? 'button' : undefined}
            aria-label={onEditAvatar ? 'Changer d\'avatar' : undefined}
          >
            {avatar}
          </div>
          {onEditAvatar && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEditAvatar(); }}
              className="absolute bottom-0 right-0 flex items-center justify-center w-7 h-7 rounded-full bg-slate-900/90 border border-cyan-400/40 text-cyan-300 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Changer d'avatar"
            >
              <PencilIcon />
            </button>
          )}
        </div>

        {/* Text stack */}
        <div className="flex-1 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.2em] text-cyan-200">{rankLine}</div>
          <h2 className="text-[22px] font-bold text-white mt-1 truncate">{username}</h2>
          <p className="text-[11px] italic text-slate-400 mt-1.5 leading-relaxed">{phrase}</p>
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {playstyle && (
              <span className="inline-flex items-center rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                {PLAYSTYLE_LABELS[playstyle] ?? playstyle}
              </span>
            )}
            {seekingAlliance === true && (
              <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                Cherche une alliance
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileHero.tsx
git commit -m "feat(profile): ProfileHero cinematic banner

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 4: `ProfileStatsCard` component

**Files:**
- Create: `apps/web/src/components/profile/ProfileStatsCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import type { ReactNode } from 'react';

interface ProfileStatsCardProps {
  rank: number | null;
  totalPoints: number;
  planetCount: number;
  allianceName: string | null;
}

function MedalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <circle cx="12" cy="14" r="6" />
      <path d="M8.5 8 L6 2 L10 2 L12 6 L14 2 L18 2 L15.5 8" />
    </svg>
  );
}

function CrystalIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3 L19 10 L12 21 L5 10 Z" />
      <path d="M5 10 H19" />
      <path d="M12 3 L9 10 L12 21" />
      <path d="M12 3 L15 10" />
    </svg>
  );
}

function PlanetIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="6" />
      <ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-20 12 12)" />
    </svg>
  );
}

function BannerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M6 3 H18 V18 L12 15 L6 18 Z" />
      <path d="M10 8 H14" />
    </svg>
  );
}

interface StatCellProps {
  icon: ReactNode;
  iconColorClass: string;
  value: string;
  label: string;
}

function StatCell({ icon, iconColorClass, value, label }: StatCellProps) {
  return (
    <div className="rounded-lg bg-accent/50 p-3 flex flex-col items-center gap-1">
      <span className={iconColorClass}>{icon}</span>
      <div className="text-lg font-bold text-foreground tabular-nums truncate max-w-full">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function ProfileStatsCard({ rank, totalPoints, planetCount, allianceName }: ProfileStatsCardProps) {
  return (
    <div className="glass-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Statistiques</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCell
          icon={<MedalIcon />}
          iconColorClass="text-amber-400"
          value={rank != null ? `#${rank}` : '—'}
          label="Rang"
        />
        <StatCell
          icon={<CrystalIcon />}
          iconColorClass="text-cyan-400"
          value={totalPoints.toLocaleString('fr-FR')}
          label="Points"
        />
        <StatCell
          icon={<PlanetIcon />}
          iconColorClass="text-blue-400"
          value={planetCount.toLocaleString('fr-FR')}
          label="Planètes"
        />
        <StatCell
          icon={<BannerIcon />}
          iconColorClass="text-amber-400"
          value={allianceName ?? '—'}
          label="Alliance"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileStatsCard.tsx
git commit -m "feat(profile): ProfileStatsCard with icons

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 5: `ProfileBioCard` component

**Files:**
- Create: `apps/web/src/components/profile/ProfileBioCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface ProfileBioCardProps {
  bio: string | null;
  isOwn: boolean;
  onSave?: (next: string | null) => void;
  isSaving?: boolean;
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

export function ProfileBioCard({ bio, isOwn, onSave, isSaving }: ProfileBioCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(bio ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isEditing) setDraft(bio ?? '');
  }, [bio, isEditing]);

  useEffect(() => {
    if (isEditing) textareaRef.current?.focus();
  }, [isEditing]);

  if (!isOwn) {
    if (!bio || bio.trim().length === 0) return null;
    return (
      <div className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold">Bio</h3>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bio}</p>
      </div>
    );
  }

  function save() {
    const next = draft.trim().length > 0 ? draft : null;
    onSave?.(next);
    setIsEditing(false);
  }

  function cancel() {
    setDraft(bio ?? '');
    setIsEditing(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  if (isEditing) {
    return (
      <div className="glass-card p-4 space-y-3 border-primary/40">
        <h3 className="text-sm font-semibold">Bio</h3>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          maxLength={500}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
          placeholder="Écrivez votre log de capitaine..."
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground tabular-nums">{draft.length}/500</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={cancel}
              disabled={isSaving}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={save}
              disabled={isSaving}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Enregistrer
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isEmpty = !bio || bio.trim().length === 0;
  return (
    <div
      className={cn('glass-card p-4 space-y-2 group relative cursor-pointer hover:border-primary/30 transition-colors')}
      onClick={() => setIsEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setIsEditing(true); } }}
      aria-label="Modifier la bio"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Bio</h3>
        <span className="text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
          <PencilIcon />
        </span>
      </div>
      {isEmpty ? (
        <p className="text-sm italic text-muted-foreground/70">Cliquez pour écrire votre log de capitaine.</p>
      ) : (
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{bio}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileBioCard.tsx
git commit -m "feat(profile): ProfileBioCard with inline edit

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 6: `ProfileAllianceCard` component

Requires Task 2.

**Files:**
- Create: `apps/web/src/components/profile/ProfileAllianceCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Link } from 'react-router';
import { AllianceTagBadge } from './AllianceTagBadge';

const ROLE_LABELS: Record<string, string> = {
  founder: 'Fondateur',
  officer: 'Officier',
  member: 'Membre',
};

interface ProfileAllianceCardProps {
  allianceName: string;
  allianceTag: string;
  allianceRole?: 'founder' | 'officer' | 'member' | null;
  isOwn: boolean;
}

export function ProfileAllianceCard({
  allianceName,
  allianceTag,
  allianceRole,
  isOwn,
}: ProfileAllianceCardProps) {
  const inner = (
    <div className="flex items-center gap-4">
      <AllianceTagBadge tag={allianceTag} size="lg" />
      <div className="flex-1 min-w-0">
        <div className="text-base font-bold text-foreground truncate">{allianceName}</div>
        {isOwn && allianceRole && (
          <div className="text-[11px] text-muted-foreground mt-0.5">{ROLE_LABELS[allianceRole] ?? allianceRole}</div>
        )}
      </div>
      {isOwn ? (
        <span className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors shrink-0">
          Gérer l'alliance →
        </span>
      ) : (
        <span className="text-sm text-muted-foreground shrink-0">→</span>
      )}
    </div>
  );

  const className = 'glass-card p-4 block hover:border-amber-500/30 transition-colors';

  return (
    <Link to="/alliance" className={className} aria-label={`Alliance ${allianceName}`}>
      {inner}
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileAllianceCard.tsx
git commit -m "feat(profile): ProfileAllianceCard with tag monogram

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 7: `ProfileSocialCard` component

**Files:**
- Create: `apps/web/src/components/profile/ProfileSocialCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { trpc } from '@/trpc';
import { useChatStore } from '@/stores/chat.store';
import { FriendList } from './FriendList';
import { FriendRequests } from './FriendRequests';

type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'friends';

type OwnProps = { kind: 'own' };
type OtherProps = {
  kind: 'other';
  userId: string;
  username: string;
  friendshipStatus: FriendshipStatus;
  friendshipId: string | null;
};

type ProfileSocialCardProps = OwnProps | OtherProps;

function OwnSocial() {
  const { data: pendingReceived } = trpc.friend.pendingReceived.useQuery();
  const [showRequests, setShowRequests] = useState(false);
  const pendingCount = pendingReceived?.length ?? 0;

  return (
    <div className="glass-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Social</h3>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amis</h4>
        </div>
        <FriendList />
      </div>

      <div className="space-y-2 pt-2 border-t border-border/50">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Demandes
            {pendingCount > 0 && (
              <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1.5 text-[9px] font-bold text-primary-foreground">
                {pendingCount}
              </span>
            )}
          </h4>
          <button
            type="button"
            onClick={() => setShowRequests((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRequests ? 'Masquer' : 'Afficher'}
          </button>
        </div>
        {showRequests && <FriendRequests />}
      </div>
    </div>
  );
}

function OtherSocial({ userId, username, friendshipStatus, friendshipId }: Exclude<ProfileSocialCardProps, { kind: 'own' }>) {
  const utils = trpc.useUtils();
  const openChat = useChatStore((s) => s.openChat);

  const invalidate = () => utils.user.getProfile.invalidate({ userId });

  const requestMutation = trpc.friend.request.useMutation({ onSuccess: invalidate });
  const cancelMutation = trpc.friend.cancel.useMutation({ onSuccess: invalidate });
  const acceptMutation = trpc.friend.accept.useMutation({ onSuccess: invalidate });
  const declineMutation = trpc.friend.decline.useMutation({ onSuccess: invalidate });
  const removeMutation = trpc.friend.remove.useMutation({ onSuccess: invalidate });

  const isMutating =
    requestMutation.isPending ||
    cancelMutation.isPending ||
    acceptMutation.isPending ||
    declineMutation.isPending ||
    removeMutation.isPending;

  return (
    <div className="glass-card p-4 flex flex-wrap items-center gap-3">
      {friendshipStatus === 'none' && (
        <button
          type="button"
          onClick={() => requestMutation.mutate({ userId })}
          disabled={isMutating}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          Ajouter en ami
        </button>
      )}

      {friendshipStatus === 'pending_sent' && friendshipId && (
        <button
          type="button"
          onClick={() => cancelMutation.mutate({ friendshipId })}
          disabled={isMutating}
          className="rounded-md bg-muted px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
        >
          Annuler la demande
        </button>
      )}

      {friendshipStatus === 'pending_received' && friendshipId && (
        <>
          <button
            type="button"
            onClick={() => acceptMutation.mutate({ friendshipId })}
            disabled={isMutating}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Accepter
          </button>
          <button
            type="button"
            onClick={() => declineMutation.mutate({ friendshipId })}
            disabled={isMutating}
            className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
          >
            Refuser
          </button>
        </>
      )}

      {friendshipStatus === 'friends' && friendshipId && (
        <button
          type="button"
          onClick={() => removeMutation.mutate({ friendshipId })}
          disabled={isMutating}
          className="rounded-md bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
        >
          Retirer des amis
        </button>
      )}

      <button
        type="button"
        onClick={() => openChat(userId, username)}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
      >
        Envoyer un message
      </button>
    </div>
  );
}

export function ProfileSocialCard(props: ProfileSocialCardProps) {
  if (props.kind === 'own') return <OwnSocial />;
  return <OtherSocial {...props} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileSocialCard.tsx
git commit -m "feat(profile): ProfileSocialCard with own and other modes

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 8: `ProfilePreferencesCard` component

**Files:**
- Create: `apps/web/src/components/profile/ProfilePreferencesCard.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { Link } from 'react-router';

interface Visibility {
  bio: boolean;
  playstyle: boolean;
  stats: boolean;
}

interface ProfilePreferencesCardProps {
  seekingAlliance: boolean;
  visibility: Visibility;
  onChange: (patch: {
    seekingAlliance?: boolean;
    profileVisibility?: Visibility;
  }) => void;
  isSaving?: boolean;
}

function Toggle({
  checked,
  onChange,
  disabled,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export function ProfilePreferencesCard({
  seekingAlliance,
  visibility,
  onChange,
  isSaving,
}: ProfilePreferencesCardProps) {
  return (
    <div className="glass-card p-4 space-y-4">
      <h3 className="text-sm font-semibold">Préférences</h3>

      <div className="flex items-center justify-between gap-4">
        <span className="text-sm text-muted-foreground">Je cherche une alliance</span>
        <Toggle
          checked={seekingAlliance}
          onChange={() => onChange({ seekingAlliance: !seekingAlliance })}
          disabled={isSaving}
          ariaLabel="Je cherche une alliance"
        />
      </div>

      <div className="space-y-2 pt-3 border-t border-border/50">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Visibilité du profil</h4>
        <p className="text-xs text-muted-foreground">Choisissez ce que les autres joueurs peuvent voir.</p>
        <div className="space-y-2">
          {([
            { key: 'bio' as const, label: 'Bio' },
            { key: 'playstyle' as const, label: 'Style de jeu' },
            { key: 'stats' as const, label: 'Statistiques' },
          ]).map(({ key, label }) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={visibility[key]}
                disabled={isSaving}
                onChange={(e) =>
                  onChange({ profileVisibility: { ...visibility, [key]: e.target.checked } })
                }
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <span className="text-sm">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="pt-3 border-t border-border/50">
        <Link
          to="/settings/notifications"
          className="text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          Préférences de notification →
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfilePreferencesCard.tsx
git commit -m "feat(profile): ProfilePreferencesCard with toggles

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 9: `ProfileView` orchestrator

Requires Tasks 1, 2, 3, 4, 5, 6, 7, 8.

**Files:**
- Create: `apps/web/src/components/profile/ProfileView.tsx`

- [ ] **Step 1: Create the component**

```tsx
import { useState } from 'react';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { Skeleton } from '@/components/common/Skeleton';
import { useAuthStore } from '@/stores/auth.store';
import { ProfileHero } from './ProfileHero';
import { ProfileStatsCard } from './ProfileStatsCard';
import { ProfileBioCard } from './ProfileBioCard';
import { ProfileAllianceCard } from './ProfileAllianceCard';
import { ProfileSocialCard } from './ProfileSocialCard';
import { ProfilePreferencesCard } from './ProfilePreferencesCard';
import { AvatarPicker } from './AvatarPicker';

interface ProfileViewProps {
  userId: string;
  isOwn: boolean;
}

function ViewSkeleton() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <Skeleton className="h-8 w-48" />
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-28 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Joueur introuvable" />
      <div className="glass-card p-8 text-center">
        <p className="text-muted-foreground">Ce profil n'existe pas ou a été supprimé.</p>
      </div>
    </div>
  );
}

function OwnView() {
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.user.getMyProfile.useQuery();
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);

  const updateMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => utils.user.getMyProfile.invalidate(),
  });

  if (isLoading || !profile) return <ViewSkeleton />;

  const visibility = (profile.profileVisibility ?? { bio: true, playstyle: true, stats: true }) as {
    bio: boolean;
    playstyle: boolean;
    stats: boolean;
  };

  function handleAvatarSelect(avatarId: string) {
    updateMutation.mutate({ avatarId });
    const user = useAuthStore.getState().user;
    if (user) {
      localStorage.setItem('user', JSON.stringify({ ...user, avatarId }));
      useAuthStore.setState({ user: { ...user, avatarId } });
    }
  }

  function handleBioSave(next: string | null) {
    updateMutation.mutate({ bio: next });
  }

  function handlePrefsChange(patch: { seekingAlliance?: boolean; profileVisibility?: typeof visibility }) {
    updateMutation.mutate(patch);
  }

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Profil" />
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <ProfileHero
          username={profile.username}
          avatarId={profile.avatarId}
          rank={profile.rank}
          bio={profile.bio}
          createdAt={profile.createdAt}
          playstyle={profile.playstyle}
          seekingAlliance={profile.seekingAlliance}
          allianceTag={profile.allianceTag}
          onEditAvatar={() => setShowAvatarPicker(true)}
        />

        <ProfileStatsCard
          rank={profile.rank}
          totalPoints={profile.totalPoints}
          planetCount={profile.planetCount}
          allianceName={profile.allianceName}
        />

        <ProfileBioCard
          bio={profile.bio}
          isOwn={true}
          onSave={handleBioSave}
          isSaving={updateMutation.isPending}
        />

        {profile.allianceName && profile.allianceTag && (
          <ProfileAllianceCard
            allianceName={profile.allianceName}
            allianceTag={profile.allianceTag}
            allianceRole={profile.allianceRole}
            isOwn={true}
          />
        )}

        <ProfileSocialCard kind="own" />

        <ProfilePreferencesCard
          seekingAlliance={profile.seekingAlliance}
          visibility={visibility}
          onChange={handlePrefsChange}
          isSaving={updateMutation.isPending}
        />
      </div>

      {showAvatarPicker && (
        <AvatarPicker
          currentAvatarId={profile.avatarId}
          onSelect={handleAvatarSelect}
          onClose={() => setShowAvatarPicker(false)}
        />
      )}
    </div>
  );
}

function OtherView({ userId }: { userId: string }) {
  const { data: player, isLoading, isError } = trpc.user.getProfile.useQuery(
    { userId },
    { enabled: !!userId },
  );

  if (isLoading) return <ViewSkeleton />;
  if (isError || !player) return <NotFound />;

  const allianceTag = player.stats?.allianceTag ?? null;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title={`Profil de ${player.username}`} />
      <div className="mx-auto w-full max-w-[720px] space-y-4">
        <ProfileHero
          username={player.username}
          avatarId={player.avatarId}
          rank={player.stats?.rank ?? null}
          bio={player.bio}
          createdAt={player.createdAt}
          playstyle={player.playstyle}
          seekingAlliance={player.seekingAlliance}
          allianceTag={allianceTag}
        />

        {player.stats && (
          <ProfileStatsCard
            rank={player.stats.rank}
            totalPoints={player.stats.totalPoints}
            planetCount={player.stats.planetCount}
            allianceName={player.stats.allianceName}
          />
        )}

        <ProfileBioCard bio={player.bio} isOwn={false} />

        {player.stats?.allianceName && allianceTag && (
          <ProfileAllianceCard
            allianceName={player.stats.allianceName}
            allianceTag={allianceTag}
            isOwn={false}
          />
        )}

        <ProfileSocialCard
          kind="other"
          userId={player.id}
          username={player.username}
          friendshipStatus={player.friendshipStatus}
          friendshipId={player.friendshipId}
        />
      </div>
    </div>
  );
}

export function ProfileView({ userId, isOwn }: ProfileViewProps) {
  return isOwn ? <OwnView /> : <OtherView userId={userId} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 3: Commit and push**

```bash
git add apps/web/src/components/profile/ProfileView.tsx
git commit -m "feat(profile): ProfileView orchestrator

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 10: Replace page wrappers

Requires Task 9.

**Files:**
- Modify: `apps/web/src/pages/Profile.tsx` (complete rewrite)
- Modify: `apps/web/src/pages/PlayerProfile.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite `Profile.tsx`**

Replace the entire file content with:

```tsx
import { useAuthStore } from '@/stores/auth.store';
import { ProfileView } from '@/components/profile/ProfileView';

export default function Profile() {
  const user = useAuthStore((s) => s.user);
  if (!user) return null;
  return <ProfileView userId={user.id} isOwn={true} />;
}
```

- [ ] **Step 2: Rewrite `PlayerProfile.tsx`**

Replace the entire file content with:

```tsx
import { useParams } from 'react-router';
import { ProfileView } from '@/components/profile/ProfileView';

export default function PlayerProfile() {
  const { userId } = useParams<{ userId: string }>();
  if (!userId) return null;
  return <ProfileView userId={userId} isOwn={false} />;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit and push**

```bash
git add apps/web/src/pages/Profile.tsx apps/web/src/pages/PlayerProfile.tsx
git commit -m "feat(profile): Profile and PlayerProfile become thin ProfileView wrappers

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 11: `/settings/notifications` page and route

Independent of all other tasks.

**Files:**
- Create: `apps/web/src/pages/SettingsNotifications.tsx`
- Modify: `apps/web/src/router.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { PageHeader } from '@/components/common/PageHeader';
import { NotificationPreferences } from '@/components/profile/NotificationPreferences';

export default function SettingsNotifications() {
  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Préférences de notification" />
      <div className="max-w-2xl">
        <div className="glass-card p-4 lg:p-6">
          <NotificationPreferences />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `apps/web/src/router.tsx`, find the block that ends with the `player/:userId` route (around line 242-245):

```tsx
      {
        path: 'player/:userId',
        lazy: lazyLoad(() => import('./pages/PlayerProfile')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
    ],
  },
]);
```

Insert a new route object immediately before the closing `],` of the routes array:

```tsx
      {
        path: 'player/:userId',
        lazy: lazyLoad(() => import('./pages/PlayerProfile')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
      {
        path: 'settings/notifications',
        lazy: lazyLoad(() => import('./pages/SettingsNotifications')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
    ],
  },
]);
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -F @exilium/web typecheck`
Expected: no errors.

- [ ] **Step 4: Commit and push**

```bash
git add apps/web/src/pages/SettingsNotifications.tsx apps/web/src/router.tsx
git commit -m "feat(settings): /settings/notifications page hosting NotificationPreferences

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
git push
```

---

## Task 12: Manual verification

No unit tests — verify visually in the browser.

- [ ] **Step 1: Final typecheck sweep**

Run: `pnpm -F @exilium/web typecheck && pnpm -F @exilium/api typecheck`
Expected: both pass with no errors.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev` (or the project's standard dev command).

- [ ] **Step 3: Test `/profile` (own view)**

Visit `/profile` with an account that has:
- A populated bio, an avatar, a playstyle, rank/points, and an alliance with members.

Verify:
- Hero shows stars + distant planet + alliance monogram (top-right) + avatar + rank line + name + first line of bio + playstyle tag.
- Hovering the avatar reveals the pencil; clicking opens `AvatarPicker`.
- Stats card shows 4 tiles with icons and French-formatted numbers.
- Bio card: clicking enters edit mode; `Esc` cancels; `Cmd/Ctrl+Enter` saves; Enregistrer/Annuler buttons work.
- Alliance card shows the monogram, alliance name, role, and the "Gérer l'alliance →" link (goes to `/alliance`).
- Social card shows friends list + collapsible requests.
- Preferences card: seeking-alliance toggle + visibility checkboxes + "Préférences de notification →" link (goes to `/settings/notifications`).

- [ ] **Step 4: Test `/profile` edge case — empty profile**

Use (or temporarily emulate) an account with no bio, no playstyle, no alliance:
- Hero tagline falls back to `"Aux commandes depuis …"`.
- No playstyle tag / no seeking-alliance tag / no alliance monogram corner.
- Alliance card is NOT rendered.
- Bio card shows `"Cliquez pour écrire votre log de capitaine."` placeholder.

- [ ] **Step 5: Test `/player/:userId` (other view)**

Visit `/player/{friend_id}`:
- Same hero, stats, bio (read-only), alliance card, social card (with friend-action + message buttons).
- No preferences card, no pencil on avatar, no click-to-edit on bio.

- [ ] **Step 6: Test visibility rules**

Visit `/player/:userId` of a player who has toggled off `bio`, `playstyle`, and `stats` in their visibility:
- Bio card is not rendered.
- Hero tagline falls back to `"Aux commandes depuis …"`.
- Playstyle tag AND seeking-alliance tag are hidden.
- Stats card is not rendered.
- Alliance card is not rendered (alliance data lives under stats and follows the stats toggle).
- Hero rank line falls back to `"Capitaine"` (no number).

- [ ] **Step 7: Test `/settings/notifications`**

Visit `/settings/notifications`:
- Page renders with the `PageHeader` and the `NotificationPreferences` component.
- The link from `Préférences de notification →` in the profile gets here.

- [ ] **Step 8: Mobile width**

Resize to ~375px and re-check `/profile`:
- Page stays in a single column.
- Stats grid collapses to 2 columns.
- Hero text doesn't overflow; avatar stays visible.

If any step fails, file notes and iterate on the specific component (no plan re-write needed).
