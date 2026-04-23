# Alliance Page Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer la page `/alliance` monolithique (487 lignes, 4 onglets, activité en bas) par un hub condensé avec sous-pages dédiées pour chaque approfondissement (activité, membres, chat, gestion).

**Architecture :** Nouveau routeur interne `/alliance/*` avec un hub qui compose 4 cartes preview (activité, chat, état-major, raccourci gestion). Un hero partagé en tête affiche les stats (membres, rang, points, fondation, bilan 7j). Découpage du fichier `Alliance.tsx` en 6 pages + 7 composants focalisés. Backend : nouveau champ `recentMilitary` + `totalPoints` + `rank` dans `alliance.myAlliance`, nouvelle procédure `message.recentAllianceChat` pour le preview.

**Tech Stack :** React + React Router (`react-router`), TanStack Query, tRPC, Tailwind + `glass-card`, `@exilium/shared` (Zod), Drizzle ORM, Vitest.

**Spec :** `docs/superpowers/specs/2026-04-23-alliance-page-revamp-design.md`.

---

## File Structure

**Créations (web) :**
```
apps/web/src/pages/alliance/
  AlliancePage.tsx              ← route container (loading, no-alliance, redirect enfants)
  AllianceHub.tsx               ← /alliance (hero + grid 4 cartes)
  AllianceActivityPage.tsx      ← /alliance/activite
  AllianceMembersPage.tsx       ← /alliance/membres (table + invite)
  AllianceChatPage.tsx          ← /alliance/chat (ChatView plein écran)
  AllianceManagePage.tsx        ← /alliance/gestion (leaders uniquement)
  NoAllianceView.tsx            ← extrait de Alliance.tsx (aucun changement logique)

apps/web/src/components/alliance/
  AllianceHero.tsx              ← blason + nom + stats + actions + kebab
  AllianceHeroStats.tsx         ← les 5 pills
  AllianceHeroKebab.tsx         ← popover "Quitter l'alliance"
  ActivityPreviewCard.tsx       ← 5 derniers logs + lien sous-page
  ChatPreviewCard.tsx           ← 3 derniers messages + lien sous-page
  MembersPreviewCard.tsx        ← fondateur + officiers + lien sous-page
  ManageShortcutCard.tsx        ← badge candidatures + lien sous-page
  MembersTable.tsx              ← table extraite + variante mobile cards (réutilisée hub-sous-page)
  useRecentAllianceChat.ts      ← hook qui expose les N derniers messages d'alliance
```

**Créations (api) :**
```
apps/api/src/modules/alliance/alliance.military.ts           ← helper pur bucketMilitaryOutcomes + tests
apps/api/src/modules/alliance/__tests__/alliance.military.test.ts
```

**Modifications (api) :**
```
apps/api/src/modules/alliance/alliance.service.ts   ← getRecentMilitary, extension myAlliance
apps/api/src/modules/message/message.router.ts     ← ajout recentAllianceChat
apps/api/src/modules/message/message.service.ts    ← ajout getRecentAllianceChat
```

**Modifications (web) :**
```
apps/web/src/router.tsx                             ← routes enfants /alliance/*
apps/web/src/pages/Alliance.tsx                     ← SUPPRIMÉ (remplacé par pages/alliance/AlliancePage.tsx)
```

---

## Task ordering and dependencies

Backend d'abord (tâches 1-4) : fournit les nouvelles données dont dépendent les composants front. Ensuite extraction (tâche 5) pour débloquer le fichier monolithe. Puis composants du bas vers le haut (tâches 6-11). Puis assemblage des pages (tâches 12-17). Enfin câblage router + suppression de l'ancien fichier (tâches 18-19).

---

### Task 1: Helper pur `bucketMilitaryOutcomes`

Helper pur qui prend une liste de `{outcome: 'victory' | 'defeat' | 'draw'}` et retourne `{wins, losses}`. Les matchs nuls (`draw`) ne sont comptés ni en victoires ni en défaites.

**Files:**
- Create: `apps/api/src/modules/alliance/alliance.military.ts`
- Test: `apps/api/src/modules/alliance/__tests__/alliance.military.test.ts`

- [ ] **Step 1: Écrire le test d'échec**

Créer `apps/api/src/modules/alliance/__tests__/alliance.military.test.ts` :

```typescript
import { describe, it, expect } from 'vitest';
import { bucketMilitaryOutcomes } from '../alliance.military.js';

describe('bucketMilitaryOutcomes', () => {
  it('returns 0/0 on empty list', () => {
    expect(bucketMilitaryOutcomes([])).toEqual({ wins: 0, losses: 0 });
  });

  it('counts victories as wins', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'victory' }, { outcome: 'victory' }])).toEqual({ wins: 2, losses: 0 });
  });

  it('counts defeats as losses', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'defeat' }, { outcome: 'defeat' }, { outcome: 'defeat' }])).toEqual({ wins: 0, losses: 3 });
  });

  it('ignores draws', () => {
    expect(bucketMilitaryOutcomes([{ outcome: 'draw' }, { outcome: 'victory' }, { outcome: 'draw' }])).toEqual({ wins: 1, losses: 0 });
  });

  it('mixes outcomes correctly', () => {
    expect(bucketMilitaryOutcomes([
      { outcome: 'victory' },
      { outcome: 'defeat' },
      { outcome: 'draw' },
      { outcome: 'victory' },
      { outcome: 'defeat' },
    ])).toEqual({ wins: 2, losses: 2 });
  });
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm test alliance.military
```

Attendu : échec avec `Failed to load url .../alliance.military.js` (module introuvable).

- [ ] **Step 3: Implémenter le helper**

Créer `apps/api/src/modules/alliance/alliance.military.ts` :

```typescript
export type MilitaryOutcome = 'victory' | 'defeat' | 'draw';

export function bucketMilitaryOutcomes(rows: Array<{ outcome: MilitaryOutcome }>): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    if (row.outcome === 'victory') wins += 1;
    else if (row.outcome === 'defeat') losses += 1;
  }
  return { wins, losses };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm test alliance.military
```

Attendu : 5 tests passent.

- [ ] **Step 5: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/api/src/modules/alliance/alliance.military.ts apps/api/src/modules/alliance/__tests__/alliance.military.test.ts
git commit -m "feat(alliance): bucketMilitaryOutcomes helper for 7d military record"
git push
```

---

### Task 2: Méthode service `getRecentMilitary(allianceId)`

Nouvelle méthode sur le service alliance qui agrège les logs de combat des 7 derniers jours et retourne `{wins, losses, windowDays: 7}` en utilisant le helper de la Task 1.

**Files:**
- Modify: `apps/api/src/modules/alliance/alliance.service.ts`

Note : cette méthode est DB-hit et n'a pas de test unitaire (cohérent avec le reste du fichier qui ne teste que les helpers purs). La validation se fait via l'intégration et la vérification manuelle en Task 19.

- [ ] **Step 1: Ajouter l'import du helper**

Dans `apps/api/src/modules/alliance/alliance.service.ts`, repérer le bloc d'imports existant et ajouter :

```typescript
import { bucketMilitaryOutcomes, type MilitaryOutcome } from './alliance.military.js';
```

- [ ] **Step 2: Ajouter la méthode `getRecentMilitary` dans le service**

Dans `apps/api/src/modules/alliance/alliance.service.ts`, ajouter la méthode à l'intérieur de l'objet retourné par `createAllianceService`, juste après la méthode `applications` (ligne ~398, avant `ranking`). L'emplacement exact peut varier — la placer en groupe logique avec les autres méthodes de lecture (`myAlliance`, `applications`, `ranking`).

```typescript
async getRecentMilitary(allianceId: string): Promise<{ wins: number; losses: number; windowDays: number }> {
  const rows = await db
    .select({ outcome: sql<MilitaryOutcome>`${allianceLogs.payload}->>'outcome'` })
    .from(allianceLogs)
    .where(and(
      eq(allianceLogs.allianceId, allianceId),
      like(allianceLogs.type, 'combat.%'),
      gte(allianceLogs.createdAt, sql`now() - interval '7 days'`),
    ));
  const { wins, losses } = bucketMilitaryOutcomes(rows);
  return { wins, losses, windowDays: 7 };
},
```

- [ ] **Step 3: Lancer le typecheck pour vérifier l'intégration**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 4: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/api/src/modules/alliance/alliance.service.ts
git commit -m "feat(alliance): getRecentMilitary service method"
git push
```

---

### Task 3: Étendre `myAlliance` avec `totalPoints`, `rank`, `recentMilitary`

`myAlliance` renvoie aujourd'hui `{...alliance, myRole, members}`. On ajoute trois champs : le total de points de l'alliance (somme des `rankings.totalPoints` des membres), le rang (nombre d'alliances avec plus de points + 1), et le bilan militaire 7j.

**Files:**
- Modify: `apps/api/src/modules/alliance/alliance.service.ts`

- [ ] **Step 1: Remplacer le corps de `myAlliance`**

Dans `apps/api/src/modules/alliance/alliance.service.ts`, localiser la méthode `myAlliance` (démarre ligne 351 à ce jour). Remplacer son corps par :

```typescript
async myAlliance(userId: string) {
  const membership = await getMembership(db, userId);
  if (!membership) return null;

  const [alliance] = await db.select().from(alliances).where(eq(alliances.id, membership.allianceId)).limit(1);

  const members = await db
    .select({
      userId: allianceMembers.userId,
      username: users.username,
      role: allianceMembers.role,
      joinedAt: allianceMembers.joinedAt,
      totalPoints: sql<number>`coalesce(${rankings.totalPoints}, 0)::int`,
    })
    .from(allianceMembers)
    .innerJoin(users, eq(users.id, allianceMembers.userId))
    .leftJoin(rankings, eq(rankings.userId, allianceMembers.userId))
    .where(eq(allianceMembers.allianceId, membership.allianceId))
    .orderBy(asc(allianceMembers.joinedAt));

  const totalPoints = members.reduce((sum, m) => sum + (m.totalPoints ?? 0), 0);

  // Rank = number of alliances with strictly more aggregated points + 1
  const [rankRow] = await db.execute<{ rank: number }>(sql`
    SELECT count(*)::int + 1 AS rank
    FROM (
      SELECT coalesce(sum(r.total_points), 0) AS pts
      FROM alliances a
      INNER JOIN alliance_members am ON am.alliance_id = a.id
      LEFT JOIN rankings r ON r.user_id = am.user_id
      WHERE a.id <> ${membership.allianceId}
      GROUP BY a.id
    ) sub
    WHERE sub.pts > ${totalPoints}
  `);
  const rank = rankRow?.rank ?? 1;

  const recentMilitary = await this.getRecentMilitary(membership.allianceId);

  return { ...alliance, myRole: membership.role, members, totalPoints, rank, recentMilitary };
},
```

Note sur `this.getRecentMilitary` : si la méthode est factorisée en objet-literal sans class, `this` ne fonctionne pas. Dans ce cas, extraire l'appel direct :

```typescript
const recentMilitary = await (async () => {
  const rows = await db
    .select({ outcome: sql<MilitaryOutcome>`${allianceLogs.payload}->>'outcome'` })
    .from(allianceLogs)
    .where(and(
      eq(allianceLogs.allianceId, membership.allianceId),
      like(allianceLogs.type, 'combat.%'),
      gte(allianceLogs.createdAt, sql`now() - interval '7 days'`),
    ));
  const { wins, losses } = bucketMilitaryOutcomes(rows);
  return { wins, losses, windowDays: 7 };
})();
```

Utiliser la variante qui passe — vérifier au typecheck. Si `this` ne marche pas, inliner comme ci-dessus et supprimer la méthode `getRecentMilitary` (elle n'est pas exposée ailleurs pour le moment).

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Build pour repérer les régressions de schéma tRPC**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm build
```

Attendu : succès.

- [ ] **Step 4: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/api/src/modules/alliance/alliance.service.ts
git commit -m "feat(alliance): myAlliance returns totalPoints, rank, recentMilitary"
git push
```

---

### Task 4: Procédure `message.recentAllianceChat`

Nouvelle procédure tRPC qui renvoie les N derniers messages du chat de l'alliance courante de l'utilisateur. Utilisée par `ChatPreviewCard` sur le hub.

**Files:**
- Modify: `apps/api/src/modules/message/message.service.ts`
- Modify: `apps/api/src/modules/message/message.router.ts`

- [ ] **Step 1: Ajouter la méthode dans le service**

Dans `apps/api/src/modules/message/message.service.ts`, localiser la méthode `getAllianceChat` (ligne ~563) et ajouter juste après :

```typescript
async getRecentAllianceChat(userId: string, limit: number) {
  const [membership] = await db
    .select({ allianceId: allianceMembers.allianceId })
    .from(allianceMembers)
    .where(eq(allianceMembers.userId, userId))
    .limit(1);
  if (!membership) return [];

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      senderUsername: users.username,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .leftJoin(users, eq(users.id, messages.senderId))
    .where(and(
      eq(messages.recipientId, userId),
      eq(messages.threadId, membership.allianceId),
      eq(messages.type, 'alliance'),
    ))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  return rows;
},
```

Vérifier que les imports nécessaires (`allianceMembers`, `desc`, éventuellement `and`, `eq`) sont bien présents en haut du fichier — les ajouter si manquants.

- [ ] **Step 2: Ajouter la procédure dans le router**

Dans `apps/api/src/modules/message/message.router.ts`, ajouter après `allianceChat` (ligne ~86) :

```typescript
    recentAllianceChat: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(10).default(3) }).optional())
      .query(async ({ ctx, input }) => {
        return messageService.getRecentAllianceChat(ctx.userId!, input?.limit ?? 3);
      }),
```

- [ ] **Step 3: Typecheck + build**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/api && pnpm typecheck && pnpm build
```

Attendu : succès.

- [ ] **Step 4: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/api/src/modules/message/message.service.ts apps/api/src/modules/message/message.router.ts
git commit -m "feat(message): recentAllianceChat procedure for hub preview"
git push
```

---

### Task 5: Extraire `NoAllianceView` dans son propre fichier

Déplacement mécanique, zéro refonte. On isole le composant pour débloquer la suppression ultérieure de `Alliance.tsx`.

**Files:**
- Create: `apps/web/src/pages/alliance/NoAllianceView.tsx`

- [ ] **Step 1: Créer le répertoire et le fichier**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
mkdir -p apps/web/src/pages/alliance
```

Créer `apps/web/src/pages/alliance/NoAllianceView.tsx` avec le contenu suivant (copie littérale de la fonction `NoAllianceView` de `apps/web/src/pages/Alliance.tsx` lignes 28-156, plus ses imports) :

```typescript
import { useEffect, useRef, useState } from 'react';
import { trpc } from '@/trpc';
import { generateDefaultBlason, type Blason } from '@exilium/shared';
import { BlasonEditor } from '@/components/alliance/BlasonEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/common/PageHeader';

interface Invitation {
  id: string;
  allianceName: string;
  allianceTag: string;
  invitedByUsername: string;
}

export function NoAllianceView({ invitations }: { invitations: Invitation[] }) {
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [blason, setBlason] = useState<Blason>(() => generateDefaultBlason('XXXX'));
  const [motto, setMotto] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const lastAutoTagRef = useRef<string>('');
  useEffect(() => {
    if (tag.length >= 2 && tag !== lastAutoTagRef.current) {
      lastAutoTagRef.current = tag;
      setBlason(generateDefaultBlason(tag));
    }
  }, [tag]);

  const createMutation = trpc.alliance.create.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const { data: searchResults } = trpc.alliance.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length >= 2 },
  );

  const applyMutation = trpc.alliance.submitApplication.useMutation({
    onSuccess: () => { utils.alliance.myAlliance.invalidate(); },
  });

  const respondMutation = trpc.alliance.respondInvitation.useMutation({
    onSuccess: () => {
      utils.alliance.myAlliance.invalidate();
      utils.alliance.myInvitations.invalidate();
    },
  });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Alliance" />

      <div className="flex gap-2">
        <Button
          variant={tab === 'create' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full"
          onClick={() => setTab('create')}
        >
          Créer
        </Button>
        <Button
          variant={tab === 'join' ? 'default' : 'outline'}
          size="sm"
          className="rounded-full"
          onClick={() => setTab('join')}
        >
          Rejoindre
        </Button>
      </div>

      {tab === 'create' && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Créer une alliance</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nom (3-30 caractères)</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nom de l'alliance" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Tag (2-8 caractères)</label>
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="TAG" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Blason &amp; devise</label>
              <BlasonEditor
                blason={blason}
                motto={motto}
                onBlasonChange={setBlason}
                onMottoChange={setMotto}
                allianceName={name || 'Alliance'}
                allianceTag={tag || 'TAG'}
              />
            </div>
            {createMutation.error && <p className="text-sm text-destructive">{createMutation.error.message}</p>}
            <Button onClick={() => createMutation.mutate({ name, tag, blason, motto })} disabled={createMutation.isPending || name.length < 3 || tag.length < 2}>
              Créer
            </Button>
          </div>
        </section>
      )}

      {tab === 'join' && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Rechercher une alliance</h3>
          <div className="space-y-3">
            <Input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Nom ou tag..." />
            {searchResults?.map((a) => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/50 py-2">
                <span className="text-sm">[{a.tag}] {a.name} <span className="text-xs text-muted-foreground">({a.memberCount} membres)</span></span>
                <Button size="sm" variant="outline" onClick={() => applyMutation.mutate({ allianceId: a.id })} disabled={applyMutation.isPending}>
                  Postuler
                </Button>
              </div>
            ))}
            {applyMutation.error && <p className="text-sm text-destructive">{applyMutation.error.message}</p>}
          </div>
        </section>
      )}

      {invitations.length > 0 && (
        <section className="glass-card p-4">
          <h3 className="text-base font-semibold mb-3">Invitations reçues</h3>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between border-b border-border/50 py-2 gap-2">
                <span className="text-sm">[{inv.allianceTag}] {inv.allianceName} — invité par {inv.invitedByUsername}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: true })}>Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => respondMutation.mutate({ invitationId: inv.id, accept: false })}>Décliner</Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur. L'ancien `Alliance.tsx` existe toujours et continue d'héberger une copie locale — pas de conflit.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/NoAllianceView.tsx
git commit -m "refactor(alliance): extract NoAllianceView into dedicated file"
git push
```

---

### Task 6: Composant `AllianceHeroStats`

Les 5 pills stats du hero : membres, rang, points, fondation, bilan 7j.

**Files:**
- Create: `apps/web/src/components/alliance/AllianceHeroStats.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
interface AllianceHeroStatsProps {
  memberCount: number;
  rank: number;
  totalPoints: number;
  foundedAt: string;
  recentMilitary: { wins: number; losses: number; windowDays: number };
}

export function AllianceHeroStats({ memberCount, rank, totalPoints, foundedAt, recentMilitary }: AllianceHeroStatsProps) {
  const founded = new Date(foundedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const points = totalPoints.toLocaleString('fr-FR');
  const { wins, losses, windowDays } = recentMilitary;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>{memberCount} membre{memberCount > 1 ? 's' : ''}</span>
      <span>Rang #{rank}</span>
      <span>{points} pts</span>
      <span>Fondée le {founded}</span>
      <span className="text-foreground/80">{windowDays}j : {wins}V / {losses}D</span>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur (le composant est isolé et non monté nulle part).

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/AllianceHeroStats.tsx
git commit -m "feat(alliance): AllianceHeroStats pills component"
git push
```

---

### Task 7: Composant `AllianceHeroKebab`

Popover inline qui ouvre un menu avec une seule action : "Quitter l'alliance". Implémenté sans dépendance tierce — état local + fermeture au clic extérieur. La confirmation est gérée par le `ConfirmDialog` existant, déclenché par le parent via callback.

**Files:**
- Create: `apps/web/src/components/alliance/AllianceHeroKebab.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { useEffect, useRef, useState } from 'react';
import { MoreIcon } from '@/lib/icons';

interface AllianceHeroKebabProps {
  onLeave: () => void;
}

export function AllianceHeroKebab({ onLeave }: AllianceHeroKebabProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClickOutside);
    return () => window.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="Plus d'actions"
        className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground"
        onClick={() => setOpen((o) => !o)}
      >
        <MoreIcon width={18} height={18} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 min-w-[160px] rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className="w-full rounded-sm px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
            onClick={() => { setOpen(false); onLeave(); }}
          >
            Quitter l'alliance
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/AllianceHeroKebab.tsx
git commit -m "feat(alliance): AllianceHeroKebab popover with Quitter action"
git push
```

---

### Task 8: Composant `AllianceHero`

Assemble blason, nom, tag, devise, les stats, les actions `[Gérer]` + kebab. Le `ConfirmDialog` de sortie est géré ici pour rester colocated avec le déclencheur kebab.

**Files:**
- Create: `apps/web/src/components/alliance/AllianceHero.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Blason } from '@exilium/shared';
import { trpc } from '@/trpc';
import { AllianceBlason } from './AllianceBlason';
import { AllianceHeroStats } from './AllianceHeroStats';
import { AllianceHeroKebab } from './AllianceHeroKebab';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface AllianceHeroProps {
  alliance: {
    id: string;
    name: string;
    tag: string;
    motto: string | null;
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    myRole: string;
    createdAt: string;
    members: unknown[];
    totalPoints: number;
    rank: number;
    recentMilitary: { wins: number; losses: number; windowDays: number };
  };
}

export function AllianceHero({ alliance }: AllianceHeroProps) {
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [leaveConfirm, setLeaveConfirm] = useState(false);

  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  const blason: Blason = {
    shape: alliance.blasonShape as Blason['shape'],
    icon: alliance.blasonIcon as Blason['icon'],
    color1: alliance.blasonColor1,
    color2: alliance.blasonColor2,
  };

  const leaveMutation = trpc.alliance.leave.useMutation({
    onSuccess: () => {
      setLeaveConfirm(false);
      utils.alliance.myAlliance.invalidate();
    },
  });

  return (
    <>
      <section className="glass-card p-4 lg:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <AllianceBlason blason={blason} size={72} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-bold">
              {alliance.name} <span className="font-normal text-muted-foreground">[{alliance.tag}]</span>
            </h2>
            {alliance.motto && (
              <p className="mt-1 line-clamp-1 text-sm italic text-foreground/80">« {alliance.motto} »</p>
            )}
            <div className="mt-3">
              <AllianceHeroStats
                memberCount={alliance.members.length}
                rank={alliance.rank}
                totalPoints={alliance.totalPoints}
                foundedAt={alliance.createdAt}
                recentMilitary={alliance.recentMilitary}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 self-start lg:self-center">
            {isLeader && (
              <Button size="sm" variant="outline" onClick={() => navigate('/alliance/gestion')}>
                Gérer
              </Button>
            )}
            <AllianceHeroKebab onLeave={() => setLeaveConfirm(true)} />
          </div>
        </div>
      </section>

      <ConfirmDialog
        open={leaveConfirm}
        onConfirm={() => leaveMutation.mutate()}
        onCancel={() => setLeaveConfirm(false)}
        title="Quitter l'alliance ?"
        description="Vous ne pourrez pas revenir sans nouvelle invitation ou candidature."
        variant="destructive"
        confirmLabel="Quitter"
      />
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/AllianceHero.tsx
git commit -m "feat(alliance): AllianceHero with stats, Gérer button, kebab Quitter"
git push
```

---

### Task 9: Composant `ActivityPreviewCard`

Carte hub qui affiche les 5 derniers logs + lien vers la sous-page. Réutilise `ActivityFeedItem` pour garder le formatage cohérent.

**Files:**
- Create: `apps/web/src/components/alliance/ActivityPreviewCard.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { ActivityFeedItem } from './ActivityFeedItem';

export function ActivityPreviewCard() {
  const { data: unread } = trpc.alliance.activityUnreadCount.useQuery();
  const unreadCount = unread?.count ?? 0;

  const query = trpc.alliance.activity.useInfiniteQuery(
    { limit: 5 },
    {
      getNextPageParam: () => undefined,
      refetchInterval: 30_000,
      refetchIntervalInBackground: false,
    },
  );

  const items = (query.data?.pages[0]?.items ?? []).slice(0, 5);

  return (
    <section className="glass-card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Activité récente</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-xs text-primary">
              {unreadCount}
            </span>
          )}
        </div>
        <Link to="/alliance/activite" className="text-xs text-primary hover:underline">
          Voir tout →
        </Link>
      </div>

      {query.isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pas encore d'activité.</p>
      ) : (
        <ul className="divide-y divide-border/40">
          {items.map((log) => (
            <ActivityFeedItem key={log.id} log={log} />
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/ActivityPreviewCard.tsx
git commit -m "feat(alliance): ActivityPreviewCard for hub"
git push
```

---

### Task 10: Composant `ChatPreviewCard`

Carte hub qui affiche les 3 derniers messages du chat d'alliance via la procédure `message.recentAllianceChat` créée en Task 4.

**Files:**
- Create: `apps/web/src/components/alliance/ChatPreviewCard.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function ChatPreviewCard() {
  const { data: messages, isLoading } = trpc.message.recentAllianceChat.useQuery(
    { limit: 3 },
    { refetchInterval: 60_000, refetchIntervalInBackground: false },
  );

  return (
    <section className="glass-card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">Chat</h3>
        <Link to="/alliance/chat" className="text-xs text-primary hover:underline">
          Ouvrir →
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : !messages || messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Silence radio.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {messages.map((m) => (
            <li key={m.id} className="truncate">
              <span className="font-medium">{m.senderUsername ?? 'inconnu'} :</span>{' '}
              <span className="text-muted-foreground">{m.body}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/ChatPreviewCard.tsx
git commit -m "feat(alliance): ChatPreviewCard for hub"
git push
```

---

### Task 11: Composant `MembersPreviewCard`

Carte hub qui affiche le fondateur + les officiers, triés par rôle puis points desc. Limite à 6 visibles avec "+N autres" si plus.

**Files:**
- Create: `apps/web/src/components/alliance/MembersPreviewCard.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { Link } from 'react-router';

interface Member {
  userId: string;
  username: string;
  role: string;
  totalPoints?: number;
}

interface MembersPreviewCardProps {
  members: Member[];
}

const MAX_VISIBLE = 6;

export function MembersPreviewCard({ members }: MembersPreviewCardProps) {
  const staff = members
    .filter((m) => m.role === 'founder' || m.role === 'officer')
    .sort((a, b) => {
      if (a.role === 'founder' && b.role !== 'founder') return -1;
      if (b.role === 'founder' && a.role !== 'founder') return 1;
      return (b.totalPoints ?? 0) - (a.totalPoints ?? 0);
    });
  const visible = staff.slice(0, MAX_VISIBLE);
  const overflow = staff.length - visible.length;

  return (
    <section className="glass-card flex flex-col p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-base font-semibold">État-major</h3>
        <Link to="/alliance/membres" className="text-xs text-primary hover:underline">
          Voir tous les membres →
        </Link>
      </div>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun officier.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {visible.map((m) => (
            <li key={m.userId} className="flex items-center justify-between">
              <span>
                <span className="text-muted-foreground capitalize">{m.role === 'founder' ? 'Fondateur' : 'Officier'} · </span>
                <span className="font-medium">{m.username}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {(m.totalPoints ?? 0).toLocaleString('fr-FR')} pts
              </span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="text-xs text-muted-foreground">+{overflow} autre{overflow > 1 ? 's' : ''}</li>
          )}
        </ul>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/MembersPreviewCard.tsx
git commit -m "feat(alliance): MembersPreviewCard (founder + officers) for hub"
git push
```

---

### Task 12: Composant `ManageShortcutCard`

Carte hub visible uniquement aux leaders. Affiche un badge candidatures + lien vers `/alliance/gestion`.

**Files:**
- Create: `apps/web/src/components/alliance/ManageShortcutCard.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { Link } from 'react-router';
import { trpc } from '@/trpc';

export function ManageShortcutCard() {
  const { data: applications } = trpc.alliance.applications.useQuery(undefined, {
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
  const count = applications?.length ?? 0;

  return (
    <Link to="/alliance/gestion" className="block">
      <section className="glass-card flex flex-col p-4 transition-colors hover:bg-accent/30">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-semibold">Gestion</h3>
          {count > 0 && (
            <span className="rounded-full bg-destructive px-2 py-0.5 text-xs text-destructive-foreground">
              {count}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {count === 0
            ? 'Aucune candidature en attente.'
            : `${count} candidature${count > 1 ? 's' : ''} en attente.`}
        </p>
        <p className="mt-2 text-xs text-primary">Ouvrir la gestion →</p>
      </section>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/ManageShortcutCard.tsx
git commit -m "feat(alliance): ManageShortcutCard with applications badge"
git push
```

---

### Task 13: Composant partagé `MembersTable`

Extrait la table desktop + les cards mobile du fichier `Alliance.tsx` existant (renderMembersSection, lignes 276-342) en un composant isolé. Utilisé par `AllianceMembersPage` (Task 16).

**Files:**
- Create: `apps/web/src/components/alliance/MembersTable.tsx`

- [ ] **Step 1: Créer le composant**

```typescript
import { trpc } from '@/trpc';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { useState } from 'react';

interface Member {
  userId: string;
  username: string;
  role: string;
  joinedAt: string;
}

interface MembersTableProps {
  members: Member[];
  myRole: string;
}

export function MembersTable({ members, myRole }: MembersTableProps) {
  const utils = trpc.useUtils();
  const [kickConfirm, setKickConfirm] = useState<string | null>(null);

  const isLeader = myRole === 'founder' || myRole === 'officer';
  const isFounder = myRole === 'founder';

  const invalidate = () => { utils.alliance.myAlliance.invalidate(); };

  const kickMutation = trpc.alliance.kick.useMutation({
    onSuccess: () => { invalidate(); setKickConfirm(null); },
  });
  const setRoleMutation = trpc.alliance.setRole.useMutation({ onSuccess: invalidate });

  return (
    <section className="glass-card space-y-3 p-4">
      <h3 className="text-base font-semibold">Membres ({members.length})</h3>

      <table className="hidden w-full text-sm lg:table">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="px-2 py-1">Joueur</th>
            <th className="px-2 py-1">Rôle</th>
            <th className="px-2 py-1">Depuis</th>
            {isLeader && <th className="px-2 py-1">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.userId} className="border-b border-border/50">
              <td className="px-2 py-1">{m.username}</td>
              <td className="px-2 py-1 capitalize">{m.role}</td>
              <td className="px-2 py-1 text-xs text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString('fr-FR')}</td>
              {isLeader && (
                <td className="px-2 py-1 flex gap-1">
                  {m.role !== 'founder' && isFounder && (
                    <Button size="sm" variant="outline" onClick={() => setRoleMutation.mutate({ userId: m.userId, role: m.role === 'officer' ? 'member' : 'officer' })}>
                      {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
                    </Button>
                  )}
                  {m.role !== 'founder' && !(m.role === 'officer' && !isFounder) && (
                    <Button size="sm" variant="destructive" onClick={() => setKickConfirm(m.userId)}>
                      Expulser
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-2 lg:hidden">
        {members.map((m) => (
          <div key={m.userId} className="space-y-2 rounded-lg p-3 transition-colors hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{m.username}</span>
              <span className="text-xs capitalize text-muted-foreground">{m.role}</span>
            </div>
            <div className="text-xs text-muted-foreground">Depuis {new Date(m.joinedAt).toLocaleDateString('fr-FR')}</div>
            {isLeader && m.role !== 'founder' && (
              <div className="flex flex-wrap gap-1">
                {isFounder && (
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRoleMutation.mutate({ userId: m.userId, role: m.role === 'officer' ? 'member' : 'officer' })}>
                    {m.role === 'officer' ? 'Rétrograder' : 'Promouvoir'}
                  </Button>
                )}
                {!(m.role === 'officer' && !isFounder) && (
                  <Button size="sm" variant="destructive" className="h-7 px-2 text-xs" onClick={() => setKickConfirm(m.userId)}>
                    Expulser
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!kickConfirm}
        onConfirm={() => { if (kickConfirm) kickMutation.mutate({ userId: kickConfirm }); }}
        onCancel={() => setKickConfirm(null)}
        title="Expulser ce membre ?"
        description="Le joueur sera immédiatement retiré de l'alliance."
        variant="destructive"
        confirmLabel="Expulser"
      />
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/components/alliance/MembersTable.tsx
git commit -m "feat(alliance): MembersTable shared component (desktop table + mobile cards)"
git push
```

---

### Task 14: Page `AllianceHub`

Assemble le hero + le grid 4 cartes. La carte `ManageShortcutCard` est masquée pour les membres simples.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceHub.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { PageHeader } from '@/components/common/PageHeader';
import { AllianceHero } from '@/components/alliance/AllianceHero';
import { ActivityPreviewCard } from '@/components/alliance/ActivityPreviewCard';
import { ChatPreviewCard } from '@/components/alliance/ChatPreviewCard';
import { MembersPreviewCard } from '@/components/alliance/MembersPreviewCard';
import { ManageShortcutCard } from '@/components/alliance/ManageShortcutCard';

interface AllianceHubProps {
  alliance: {
    id: string;
    name: string;
    tag: string;
    motto: string | null;
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    myRole: string;
    createdAt: string;
    members: { userId: string; username: string; role: string; joinedAt: string; totalPoints?: number }[];
    totalPoints: number;
    rank: number;
    recentMilitary: { wins: number; losses: number; windowDays: number };
  };
}

export function AllianceHub({ alliance }: AllianceHubProps) {
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Alliance" />

      <AllianceHero alliance={alliance} />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr] lg:gap-6">
        <ActivityPreviewCard />
        <ChatPreviewCard />
        <MembersPreviewCard members={alliance.members} />
        {isLeader && <ManageShortcutCard />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceHub.tsx
git commit -m "feat(alliance): AllianceHub page assembling hero + preview cards"
git push
```

---

### Task 15: Page `AllianceActivityPage`

Sous-page qui monte le composant `ActivityFeed` existant en pleine largeur. Le mark-seen est géré par `ActivityFeed` lui-même.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceActivityPage.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { ActivityFeed } from '@/components/alliance/ActivityFeed';
import { Button } from '@/components/ui/button';

export function AllianceActivityPage() {
  const utils = trpc.useUtils();
  const { data: unread } = trpc.alliance.activityUnreadCount.useQuery();
  const unreadCount = unread?.count ?? 0;

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader
        title="Activité"
        actions={
          <Button asChild size="sm" variant="outline">
            <Link to="/alliance">← Alliance</Link>
          </Button>
        }
      />

      <ActivityFeed
        unreadCount={unreadCount}
        onOpened={() => utils.alliance.activityUnreadCount.invalidate()}
      />
    </div>
  );
}
```

Note : si `Button` n'accepte pas `asChild`, remplacer par un simple `<Link>` stylé en bouton. Vérifier la signature au typecheck et adapter.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur. Si `asChild` manque sur `Button`, remplacer par :

```typescript
actions={
  <Link
    to="/alliance"
    className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
  >
    ← Alliance
  </Link>
}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceActivityPage.tsx
git commit -m "feat(alliance): AllianceActivityPage sub-page"
git push
```

---

### Task 16: Page `AllianceMembersPage`

Sous-page qui monte `MembersTable` + un encart "Inviter un joueur" (visible uniquement aux leaders) au-dessus.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceMembersPage.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { useState } from 'react';
import { Link } from 'react-router';
import { trpc } from '@/trpc';
import { PageHeader } from '@/components/common/PageHeader';
import { MembersTable } from '@/components/alliance/MembersTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface AllianceMembersPageProps {
  alliance: {
    myRole: string;
    members: { userId: string; username: string; role: string; joinedAt: string }[];
  };
}

export function AllianceMembersPage({ alliance }: AllianceMembersPageProps) {
  const [inviteUsername, setInviteUsername] = useState('');
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';

  const inviteMutation = trpc.alliance.invite.useMutation({
    onSuccess: () => setInviteUsername(''),
  });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader
        title="Membres"
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />

      {isLeader && (
        <section className="glass-card space-y-3 p-4">
          <h3 className="text-base font-semibold">Inviter un joueur</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              value={inviteUsername}
              onChange={(e) => setInviteUsername(e.target.value)}
              placeholder="Nom du joueur"
              className="w-60"
            />
            <Button
              onClick={() => inviteMutation.mutate({ username: inviteUsername })}
              disabled={inviteMutation.isPending || !inviteUsername}
            >
              Inviter
            </Button>
            {inviteMutation.error && (
              <span className="self-center text-sm text-destructive">{inviteMutation.error.message}</span>
            )}
          </div>
        </section>
      )}

      <MembersTable members={alliance.members} myRole={alliance.myRole} />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceMembersPage.tsx
git commit -m "feat(alliance): AllianceMembersPage with invite shortcut"
git push
```

---

### Task 17: Page `AllianceChatPage`

Sous-page plein écran qui monte `ChatView` sur le thread d'alliance. Le `ChatView` existant accepte `threadId` et `otherUsername` — on passe l'ID d'alliance et le libellé `[TAG] Nom`.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceChatPage.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { Link } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { ChatView } from '@/components/chat/ChatView';

interface AllianceChatPageProps {
  alliance: { id: string; name: string; tag: string };
}

export function AllianceChatPage({ alliance }: AllianceChatPageProps) {
  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col p-4 lg:p-6">
      <PageHeader
        title="Chat d'alliance"
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />
      <div className="mt-4 flex-1 overflow-hidden">
        <ChatView
          threadId={alliance.id}
          otherUsername={`[${alliance.tag}] ${alliance.name}`}
          className="h-full"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur. Si la hauteur `4rem` ne correspond pas au header effectif dans le layout, ajuster après test manuel en Task 21.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceChatPage.tsx
git commit -m "feat(alliance): AllianceChatPage full-screen chat view"
git push
```

---

### Task 18: Page `AllianceManagePage`

Sous-page leaders-only. Regroupe : candidatures, blason editor, description. Garde de redirection si non-leader.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceManagePage.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router';
import { trpc } from '@/trpc';
import type { Blason } from '@exilium/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { BlasonEditor } from '@/components/alliance/BlasonEditor';
import { Button } from '@/components/ui/button';

interface AllianceManagePageProps {
  alliance: {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    motto: string | null;
    blasonShape: string;
    blasonIcon: string;
    blasonColor1: string;
    blasonColor2: string;
    myRole: string;
  };
}

export function AllianceManagePage({ alliance }: AllianceManagePageProps) {
  const isLeader = alliance.myRole === 'founder' || alliance.myRole === 'officer';
  const isFounder = alliance.myRole === 'founder';

  if (!isLeader) return <Navigate to="/alliance" replace />;

  const utils = trpc.useUtils();
  const [description, setDescription] = useState(alliance.description ?? '');

  const currentBlason: Blason = {
    shape: alliance.blasonShape as Blason['shape'],
    icon: alliance.blasonIcon as Blason['icon'],
    color1: alliance.blasonColor1,
    color2: alliance.blasonColor2,
  };
  const [editBlason, setEditBlason] = useState<Blason>(currentBlason);
  const [editMotto, setEditMotto] = useState<string | null>(alliance.motto);

  const blasonDirty = useMemo(() => {
    return editBlason.shape !== currentBlason.shape
      || editBlason.icon !== currentBlason.icon
      || editBlason.color1.toLowerCase() !== currentBlason.color1.toLowerCase()
      || editBlason.color2.toLowerCase() !== currentBlason.color2.toLowerCase()
      || (editMotto ?? '') !== (alliance.motto ?? '');
  }, [editBlason, editMotto, currentBlason, alliance.motto]);

  const invalidate = () => {
    utils.alliance.myAlliance.invalidate();
    utils.alliance.applications.invalidate();
  };

  const { data: applications } = trpc.alliance.applications.useQuery();
  const respondAppMutation = trpc.alliance.respondApplication.useMutation({ onSuccess: invalidate });
  const updateMutation = trpc.alliance.update.useMutation({ onSuccess: invalidate });
  const updateBlasonMutation = trpc.alliance.updateBlason.useMutation({ onSuccess: invalidate });

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader
        title="Gestion"
        actions={
          <Link
            to="/alliance"
            className="inline-flex h-8 items-center rounded-md border border-input bg-background px-3 text-sm hover:bg-accent"
          >
            ← Alliance
          </Link>
        }
      />

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">
          Candidatures{applications && applications.length > 0 ? ` (${applications.length})` : ''}
        </h3>
        {!applications || applications.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune candidature en attente.</p>
        ) : (
          <div className="space-y-2">
            {applications.map((app) => (
              <div key={app.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2">
                <span className="text-sm">{app.applicantUsername}</span>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: true })}>Accepter</Button>
                  <Button size="sm" variant="outline" onClick={() => respondAppMutation.mutate({ applicationId: app.id, accept: false })}>Décliner</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isFounder && (
        <section className="glass-card space-y-4 p-4">
          <h3 className="text-base font-semibold">Blason &amp; devise</h3>
          <BlasonEditor
            blason={editBlason}
            motto={editMotto}
            onBlasonChange={setEditBlason}
            onMottoChange={setEditMotto}
            allianceName={alliance.name}
            allianceTag={alliance.tag}
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => { setEditBlason(currentBlason); setEditMotto(alliance.motto); }}
              disabled={!blasonDirty || updateBlasonMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              onClick={() => updateBlasonMutation.mutate({ blason: editBlason, motto: editMotto })}
              disabled={!blasonDirty || updateBlasonMutation.isPending}
            >
              Enregistrer
            </Button>
          </div>
          {updateBlasonMutation.error && (
            <p className="text-sm text-destructive">{updateBlasonMutation.error.message}</p>
          )}
        </section>
      )}

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">Description</h3>
        <textarea
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <Button onClick={() => updateMutation.mutate({ description })} disabled={updateMutation.isPending}>
          Mettre à jour
        </Button>
      </section>

      <section className="glass-card space-y-3 p-4">
        <h3 className="text-base font-semibold">Membres &amp; rôles</h3>
        <p className="text-sm text-muted-foreground">
          Les actions promouvoir / rétrograder / expulser sont accessibles sur{' '}
          <Link to="/alliance/membres" className="text-primary hover:underline">la liste des membres</Link>.
        </p>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceManagePage.tsx
git commit -m "feat(alliance): AllianceManagePage with applications, blason editor, description"
git push
```

---

### Task 19: Page racine `AlliancePage` (route container)

Gère le loading, l'état no-alliance (monte `NoAllianceView`), et passe l'alliance aux pages enfants via un `Outlet` typé avec `useOutletContext`.

**Files:**
- Create: `apps/web/src/pages/alliance/AlliancePage.tsx`

- [ ] **Step 1: Créer la page**

```typescript
import { Outlet, useOutletContext } from 'react-router';
import { trpc } from '@/trpc';
import { CardGridSkeleton } from '@/components/common/PageSkeleton';
import { PageHeader } from '@/components/common/PageHeader';
import { NoAllianceView } from './NoAllianceView';

type MyAlliance = NonNullable<Awaited<ReturnType<ReturnType<typeof trpc.alliance.myAlliance.useQuery>['data'] extends infer T ? () => T : never>>>;

// Simpler typing: just infer from the query result
type Alliance = NonNullable<ReturnType<typeof trpc.alliance.myAlliance.useQuery>['data']>;

export default function AlliancePage() {
  const { data: myAlliance, isLoading } = trpc.alliance.myAlliance.useQuery();
  const { data: invitations } = trpc.alliance.myInvitations.useQuery();

  if (isLoading) {
    return (
      <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
        <PageHeader title="Alliance" />
        <CardGridSkeleton count={2} />
      </div>
    );
  }

  if (!myAlliance) return <NoAllianceView invitations={invitations ?? []} />;

  return <Outlet context={{ alliance: myAlliance } satisfies { alliance: Alliance }} />;
}

export function useAllianceContext() {
  return useOutletContext<{ alliance: Alliance }>();
}
```

Note : le bloc de typage `MyAlliance` au-dessus est redondant — garder uniquement `type Alliance = NonNullable<ReturnType<typeof trpc.alliance.myAlliance.useQuery>['data']>;` et supprimer la ligne `MyAlliance`.

- [ ] **Step 2: Nettoyer le typage**

Vérifier que le fichier final ne garde que la version courte de `Alliance`. La ligne `type MyAlliance = ...` est à supprimer avant commit.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 4: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AlliancePage.tsx
git commit -m "feat(alliance): AlliancePage route container with Outlet context"
git push
```

---

### Task 20: Adapter les pages enfants pour consommer `useAllianceContext`

Les pages créées en Tasks 14-18 reçoivent `alliance` via props. Les câbler au context du parent pour qu'elles soient montables par le router.

**Files:**
- Create: `apps/web/src/pages/alliance/AllianceHubRoute.tsx`
- Create: `apps/web/src/pages/alliance/AllianceActivityRoute.tsx`
- Create: `apps/web/src/pages/alliance/AllianceMembersRoute.tsx`
- Create: `apps/web/src/pages/alliance/AllianceChatRoute.tsx`
- Create: `apps/web/src/pages/alliance/AllianceManageRoute.tsx`

Chaque route est un wrapper très fin qui lit le context du parent et passe les props à la page. Cette séparation évite de coupler `AllianceHub` (composant réutilisable) au mécanisme `useOutletContext`.

- [ ] **Step 1: Créer les 5 wrappers**

`apps/web/src/pages/alliance/AllianceHubRoute.tsx` :

```typescript
import { useAllianceContext } from './AlliancePage';
import { AllianceHub } from './AllianceHub';

export default function AllianceHubRoute() {
  const { alliance } = useAllianceContext();
  return <AllianceHub alliance={alliance} />;
}
```

`apps/web/src/pages/alliance/AllianceActivityRoute.tsx` :

```typescript
import { AllianceActivityPage } from './AllianceActivityPage';

export default function AllianceActivityRoute() {
  return <AllianceActivityPage />;
}
```

`apps/web/src/pages/alliance/AllianceMembersRoute.tsx` :

```typescript
import { useAllianceContext } from './AlliancePage';
import { AllianceMembersPage } from './AllianceMembersPage';

export default function AllianceMembersRoute() {
  const { alliance } = useAllianceContext();
  return <AllianceMembersPage alliance={alliance} />;
}
```

`apps/web/src/pages/alliance/AllianceChatRoute.tsx` :

```typescript
import { useAllianceContext } from './AlliancePage';
import { AllianceChatPage } from './AllianceChatPage';

export default function AllianceChatRoute() {
  const { alliance } = useAllianceContext();
  return <AllianceChatPage alliance={alliance} />;
}
```

`apps/web/src/pages/alliance/AllianceManageRoute.tsx` :

```typescript
import { useAllianceContext } from './AlliancePage';
import { AllianceManagePage } from './AllianceManagePage';

export default function AllianceManageRoute() {
  const { alliance } = useAllianceContext();
  return <AllianceManagePage alliance={alliance} />;
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck
```

Attendu : pas d'erreur.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/pages/alliance/AllianceHubRoute.tsx apps/web/src/pages/alliance/AllianceActivityRoute.tsx apps/web/src/pages/alliance/AllianceMembersRoute.tsx apps/web/src/pages/alliance/AllianceChatRoute.tsx apps/web/src/pages/alliance/AllianceManageRoute.tsx
git commit -m "feat(alliance): route wrappers that read AlliancePage outlet context"
git push
```

---

### Task 21: Câbler les routes dans `router.tsx`

Transformer l'entrée `alliance` actuelle en route parent avec 5 enfants. L'index enfant monte le hub, les 4 sous-routes montent leurs pages respectives.

**Files:**
- Modify: `apps/web/src/router.tsx:216-220`

- [ ] **Step 1: Remplacer le bloc de route alliance**

Dans `apps/web/src/router.tsx`, localiser :

```typescript
      {
        path: 'alliance',
        lazy: lazyLoad(() => import('./pages/Alliance')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
      },
```

Remplacer par :

```typescript
      {
        path: 'alliance',
        lazy: lazyLoad(() => import('./pages/alliance/AlliancePage')),
        errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
        children: [
          {
            index: true,
            lazy: lazyLoad(() => import('./pages/alliance/AllianceHubRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'activite',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceActivityRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'membres',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceMembersRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'chat',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceChatRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
          {
            path: 'gestion',
            lazy: lazyLoad(() => import('./pages/alliance/AllianceManageRoute')),
            errorElement: <ErrorBoundary><RouteErrorFallback /></ErrorBoundary>,
          },
        ],
      },
```

- [ ] **Step 2: Typecheck + build**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck && pnpm build
```

Attendu : succès. Les 5 nouveaux chunks sont émis.

- [ ] **Step 3: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add apps/web/src/router.tsx
git commit -m "feat(router): alliance hub + sub-routes (/activite, /membres, /chat, /gestion)"
git push
```

---

### Task 22: Supprimer l'ancien `apps/web/src/pages/Alliance.tsx`

Une fois les routes basculées, l'ancien fichier n'est plus importé nulle part. On le supprime pour fermer la refonte.

**Files:**
- Delete: `apps/web/src/pages/Alliance.tsx`

- [ ] **Step 1: Vérifier qu'aucun import ne pointe encore vers l'ancien fichier**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
grep -r "pages/Alliance'" apps/web/src --include="*.ts" --include="*.tsx" | grep -v "pages/alliance/"
```

Attendu : aucun résultat (seuls les imports vers `pages/alliance/...` avec slash restent).

- [ ] **Step 2: Supprimer le fichier**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
rm apps/web/src/pages/Alliance.tsx
```

- [ ] **Step 3: Typecheck + build**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium/apps/web && pnpm typecheck && pnpm build
```

Attendu : succès.

- [ ] **Step 4: Commit**

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
git add -u apps/web/src/pages/Alliance.tsx
git commit -m "refactor(alliance): remove legacy monolithic Alliance.tsx"
git push
```

---

### Task 23: Vérification manuelle end-to-end

Vérification fonctionnelle dans le navigateur. Cette tâche ne touche pas le code mais valide l'intégration.

**Files:** aucun

- [ ] **Step 1: Lancer l'environnement de dev**

Dans le terminal utilisateur :

```bash
cd /Users/julienaubree/_projet/exilium-game/exilium
pnpm dev
```

- [ ] **Step 2: Vérifier le hub en tant que fondateur**

Naviguer vers `/alliance` avec un compte fondateur. Vérifier :
- Le hero affiche blason + nom + tag + devise + 5 pills (membres, rang, points, fondation, 7j).
- Les 4 cartes sont visibles : Activité récente (5 items), Chat (3 items ou "Silence radio."), État-major (fondateur + officiers), Gestion (avec badge si candidatures).
- Le bouton `[Gérer]` navigue vers `/alliance/gestion`.
- Le kebab `⋮` ouvre un menu "Quitter l'alliance".

- [ ] **Step 3: Vérifier les sous-pages**

Depuis le hub, cliquer sur chaque lien "Voir tout →" / "Ouvrir →" / "Ouvrir la gestion →" :
- `/alliance/activite` → feed complet avec filtres (Tous/Militaire/Membres).
- `/alliance/membres` → table des membres + encart "Inviter un joueur" (leaders uniquement).
- `/alliance/chat` → vue plein écran du chat, input en bas fonctionnel.
- `/alliance/gestion` → candidatures + blason editor + description.
- Chaque sous-page a un bouton "← Alliance" qui ramène au hub.

- [ ] **Step 4: Vérifier en tant que membre simple**

Se connecter avec un compte membre (non leader). Vérifier :
- `[Gérer]` masqué sur le hero.
- `ManageShortcutCard` masquée sur le hub.
- Naviguer directement à `/alliance/gestion` → redirige vers `/alliance`.
- Le kebab `⋮` reste disponible et fonctionne.

- [ ] **Step 5: Vérifier le bilan 7j**

Lancer une attaque qui aboutit à une victoire (ou utiliser un compte déjà ayant des combats dans les 7 derniers jours).
- Hero stats : `7j : NV / MD` où N = victoires combat.* sur 7j, M = défaites.
- Les matchs nuls (draw) ne sont pas comptés.

- [ ] **Step 6: Vérifier le mobile**

Ouvrir en viewport mobile (DevTools ≤ 640px de large) :
- Le hero passe en colonne (blason au-dessus, stats en wrap, actions sous les stats).
- Les 4 cartes du hub s'empilent (1 colonne).
- Les sous-pages restent lisibles et tappables.

- [ ] **Step 7: Rapport**

Noter les défauts visuels/fonctionnels trouvés dans un commentaire ou ticket de suivi. Petits ajustements (espacements, hauteurs, labels) : corriger directement. Bugs structurels : rouvrir la tâche concernée.

---

## Self-Review Checklist

**1. Spec coverage :**

| Section du spec | Tâche(s) correspondante(s) |
|---|---|
| 1. Architecture → Routing | Task 21 |
| 1. Architecture → Structure de fichiers | Tasks 5-20 (création des composants et pages) |
| 1. Architecture → Backend (`recentMilitary`) | Tasks 1, 2, 3 |
| 2.1 Hero | Tasks 6, 7, 8 |
| 2.2 Grid 2 colonnes | Task 14 |
| 2.3 ActivityPreviewCard | Task 9 |
| 2.4 ChatPreviewCard + `useAllianceChatRecent` | Tasks 4, 10 (procédure + carte) |
| 2.5 MembersPreviewCard | Task 11 |
| 2.6 ManageShortcutCard | Task 12 |
| 3.1 `/alliance/activite` | Task 15 |
| 3.2 `/alliance/membres` | Tasks 13, 16 |
| 3.3 `/alliance/chat` | Task 17 |
| 3.4 `/alliance/gestion` | Task 18 |
| 4. `recentMilitary` API | Tasks 1, 2, 3 |
| 5. États vides / leaders-only | Tasks 8, 9, 10, 11, 12, 18 (gardes) |
| 6. Navigation | Tasks 15-18 (bouton retour), 21 (routes) |
| 7. Mobile | Tasks 6, 8, 14 (responsive), 17 (chat dvh) |
| 8. Tests | Task 1 (helper). Le reste est couvert par typecheck + smoke Task 23 |
| 9. Rollout / nettoyage | Task 22 |

**Écarts documentés :** Le spec mentionnait un hook `useAllianceChatRecent(3)` ; j'ai préféré consommer directement `trpc.message.recentAllianceChat` via React Query dans le composant (un hook utilitaire supplémentaire serait un wrapping gratuit). Pas d'impact comportemental. Le spec indiquait aussi un écran "État vide : Pas encore d'activité." — implémenté en Task 9.

**2. Placeholders :** aucun `TBD`, `TODO`, `handle edge cases`, ou code non complet. Chaque code bloc est intégral.

**3. Cohérence des types :**

- `alliance` prop shape cohérente entre `AllianceHero` (Task 8), `AllianceHub` (Task 14), `AllianceMembersPage` (Task 16), `AllianceChatPage` (Task 17), `AllianceManagePage` (Task 18). Toutes partagent la sortie de `trpc.alliance.myAlliance.useQuery()` enrichie par `totalPoints`, `rank`, `recentMilitary` (Task 3).
- `recentMilitary: { wins, losses, windowDays }` — même shape côté API (Task 2) et côté consommateurs (`AllianceHeroStats` Task 6).
- `MilitaryOutcome` exporté par `alliance.military.ts` (Task 1) et réutilisé par `alliance.service.ts` (Task 2).
- `useAllianceContext` exporté par `AlliancePage.tsx` (Task 19) et consommé par les 5 wrappers route (Task 20).

---

## Execution Handoff

**Plan complet et sauvegardé à `docs/superpowers/plans/2026-04-23-alliance-page-revamp.md`. Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — je dispatche un subagent frais par tâche, avec revue spec + revue qualité entre chaque, itération rapide.

**2. Inline Execution** — j'exécute les tâches dans cette session avec des points de contrôle par batch.

**Quelle approche ?**
