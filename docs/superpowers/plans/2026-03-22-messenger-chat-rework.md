# Messenger Chat Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the email-style Messages page with a Messenger-like chat interface (split panel, bubbles, overlay desktop).

**Architecture:** Backend adds 3 new endpoints (conversations, user.search, deleteThread) and modifies `send` for thread auto-detection. Frontend replaces `Messages.tsx` entirely with shared chat components (UserAvatar, ChatBubble, ChatMessageList, ChatInput) used by both the full page and a desktop overlay. State managed via Zustand store.

**Tech Stack:** tRPC, Drizzle ORM, PostgreSQL, React, Tailwind CSS, Zustand

---

## File Structure

**API — New files:**
- `apps/api/src/modules/user/user.service.ts` — user search service
- `apps/api/src/modules/user/user.router.ts` — user search router

**API — Modified files:**
- `apps/api/src/modules/message/message.service.ts` — add `listConversations`, `deleteThread`, modify `sendMessage`
- `apps/api/src/modules/message/message.router.ts` — add `conversations`, `deleteThread` procedures, modify `send` input
- `apps/api/src/trpc/app-router.ts` — register user router

**Frontend — New files:**
- `apps/web/src/components/chat/UserAvatar.tsx` — avatar with hashed gradient color
- `apps/web/src/components/chat/ChatBubble.tsx` — single message bubble
- `apps/web/src/components/chat/ChatMessageList.tsx` — scrollable message list with date separators
- `apps/web/src/components/chat/ChatInput.tsx` — text input + send button
- `apps/web/src/components/chat/ConversationList.tsx` — left panel conversation list
- `apps/web/src/components/chat/ChatView.tsx` — right panel chat view (header + messages + input)
- `apps/web/src/components/chat/ChatOverlay.tsx` — desktop floating overlay
- `apps/web/src/components/chat/ChatOverlayWindow.tsx` — single overlay chat window
- `apps/web/src/stores/chat.store.ts` — Zustand store for overlay state

**Frontend — Modified files:**
- `apps/web/src/pages/Messages.tsx` — complete rewrite as split-panel chat
- `apps/web/src/hooks/useNotifications.ts` — add conversations invalidation + overlay integration
- `apps/web/src/components/layout/Layout.tsx` — mount ChatOverlay

---

### Task 1: User search API

**Files:**
- Create: `apps/api/src/modules/user/user.service.ts`
- Create: `apps/api/src/modules/user/user.router.ts`
- Modify: `apps/api/src/trpc/app-router.ts`

- [ ] **Step 1: Create user service**

```ts
// apps/api/src/modules/user/user.service.ts
import { ilike, ne, and } from 'drizzle-orm';
import { users } from '@ogame-clone/db';
import type { Database } from '@ogame-clone/db';

export function createUserService(db: Database) {
  return {
    async searchUsers(currentUserId: string, query: string) {
      return db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(and(
          ilike(users.username, `%${query}%`),
          ne(users.id, currentUserId),
        ))
        .limit(10);
    },
  };
}
```

- [ ] **Step 2: Create user router**

```ts
// apps/api/src/modules/user/user.router.ts
import { z } from 'zod';
import { protectedProcedure, router } from '../../trpc/router.js';
import type { createUserService } from './user.service.js';

export function createUserRouter(userService: ReturnType<typeof createUserService>) {
  return router({
    search: protectedProcedure
      .input(z.object({ query: z.string().min(2).max(64) }))
      .query(async ({ ctx, input }) => {
        return userService.searchUsers(ctx.userId!, input.query);
      }),
  });
}
```

- [ ] **Step 3: Register user router in app-router**

In `apps/api/src/trpc/app-router.ts`:
- Add imports for `createUserService` and `createUserRouter`
- Instantiate: `const userService = createUserService(db);`
- Create router: `const userRouter = createUserRouter(userService);`
- Add to router object: `user: userRouter,`

- [ ] **Step 4: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/user/ apps/api/src/trpc/app-router.ts
git commit -m "feat: add user.search endpoint for chat autocomplete"
```

---

### Task 2: Message conversations API + send modification + deleteThread

**Files:**
- Modify: `apps/api/src/modules/message/message.service.ts`
- Modify: `apps/api/src/modules/message/message.router.ts`

- [ ] **Step 1: Add `listConversations` to message service**

Add this method to the object returned by `createMessageService` in `apps/api/src/modules/message/message.service.ts`:

```ts
async listConversations(userId: string) {
  // Step 1: Get all distinct threadIds where user participates (player messages only)
  const threads = await db
    .select({
      threadId: messages.threadId,
      lastCreatedAt: sql<Date>`MAX(${messages.createdAt})`.as('last_created_at'),
    })
    .from(messages)
    .where(
      and(
        or(eq(messages.senderId, userId), eq(messages.recipientId, userId)),
        eq(messages.type, 'player'),
        sql`${messages.threadId} IS NOT NULL`,
      ),
    )
    .groupBy(messages.threadId)
    .orderBy(sql`MAX(${messages.createdAt}) DESC`);

  if (threads.length === 0) return [];

  // Step 2: For each thread, get last message + other user + unread count
  const results = await Promise.all(
    threads.map(async (t) => {
      const [lastMsg] = await db
        .select({
          body: messages.body,
          senderId: messages.senderId,
          recipientId: messages.recipientId,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(eq(messages.threadId, t.threadId!))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      if (!lastMsg) return null;

      // Determine the other user
      const otherUserId = lastMsg.senderId === userId ? lastMsg.recipientId : lastMsg.senderId;
      if (!otherUserId) return null;

      const [otherUser] = await db
        .select({ id: users.id, username: users.username })
        .from(users)
        .where(eq(users.id, otherUserId))
        .limit(1);

      if (!otherUser) return null;

      // Unread count for this thread
      const [unreadResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.threadId, t.threadId!),
            eq(messages.recipientId, userId),
            eq(messages.read, false),
          ),
        );

      return {
        threadId: t.threadId!,
        otherUser: { id: otherUser.id, username: otherUser.username },
        lastMessage: {
          body: lastMsg.body,
          senderId: lastMsg.senderId,
          createdAt: lastMsg.createdAt,
        },
        unreadCount: unreadResult?.count ?? 0,
      };
    }),
  );

  return results.filter(Boolean);
},
```

Add required imports at the top of the file: `sql`, `desc` (already there), `or` (already there).

- [ ] **Step 2: Add `deleteThread` to message service**

Add this method to the service object:

```ts
async deleteThread(userId: string, threadId: string) {
  await db
    .delete(messages)
    .where(
      and(
        eq(messages.threadId, threadId),
        or(eq(messages.senderId, userId), eq(messages.recipientId, userId)),
      ),
    );
  return { success: true };
},
```

- [ ] **Step 3: Modify `sendMessage` for thread auto-detection**

In the existing `sendMessage` method, after resolving the recipient and before the insert:

```ts
// Auto-detect existing thread between the two users
let existingThreadId: string | undefined;
const [existingThread] = await db
  .select({ threadId: messages.threadId })
  .from(messages)
  .where(
    and(
      eq(messages.type, 'player'),
      sql`${messages.threadId} IS NOT NULL`,
      or(
        and(eq(messages.senderId, senderId), eq(messages.recipientId, recipient.id)),
        and(eq(messages.senderId, recipient.id), eq(messages.recipientId, senderId)),
      ),
    ),
  )
  .limit(1);

if (existingThread) {
  existingThreadId = existingThread.threadId!;
}
```

Then modify the insert and post-insert logic:

```ts
const [msg] = await db
  .insert(messages)
  .values({
    senderId,
    recipientId: recipient.id,
    type: 'player',
    subject,
    body,
    threadId: existingThreadId ?? undefined,
  })
  .returning();

// Only create a new thread (self-referential) if no existing thread was found
if (!existingThreadId) {
  await db
    .update(messages)
    .set({ threadId: msg.id })
    .where(eq(messages.id, msg.id));
  msg.threadId = msg.id;
}
```

Also, change the `subject` handling: if no `subject` is provided, auto-generate with `body.slice(0, 100)`. Make `subject` an optional parameter in the method signature: `async sendMessage(senderId: string, recipientUsername: string, subject: string | undefined, body: string, threadId?: string)`.

- [ ] **Step 4: Add `senderId` to SSE notification payload**

In both `sendMessage` and `replyToMessage` methods, update the `publishNotification` call:

```ts
publishNotification(redis, recipient.id, {
  type: 'new-message',
  payload: { messageId: msg.id, type: 'player', subject, senderUsername: sender?.username ?? null, senderId },
});
```

- [ ] **Step 5: Add `conversations` and `deleteThread` to message router**

In `apps/api/src/modules/message/message.router.ts`, add:

```ts
conversations: protectedProcedure
  .query(async ({ ctx }) => {
    return messageService.listConversations(ctx.userId!);
  }),

deleteThread: protectedProcedure
  .input(z.object({ threadId: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    return messageService.deleteThread(ctx.userId!, input.threadId);
  }),
```

- [ ] **Step 6: Modify `send` procedure input**

In the `send` procedure, make `subject` optional:

```ts
send: protectedProcedure
  .input(z.object({
    recipientUsername: z.string().min(1).max(64),
    subject: z.string().min(1).max(255).optional(),
    body: z.string().min(1).max(5000),
  }))
  .mutation(async ({ ctx, input }) => {
    const subject = input.subject ?? input.body.slice(0, 100);
    return messageService.sendMessage(ctx.userId!, input.recipientUsername, subject, input.body);
  }),
```

- [ ] **Step 7: Verify build**

Run: `cd apps/api && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/message/
git commit -m "feat: add conversations, deleteThread endpoints, thread auto-detection, senderId in SSE"
```

---

### Task 3: Shared chat components

**Files:**
- Create: `apps/web/src/components/chat/UserAvatar.tsx`
- Create: `apps/web/src/components/chat/ChatBubble.tsx`
- Create: `apps/web/src/components/chat/ChatMessageList.tsx`
- Create: `apps/web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Create UserAvatar**

```tsx
// apps/web/src/components/chat/UserAvatar.tsx

const AVATAR_GRADIENTS = [
  ['#6366f1', '#8b5cf6'],
  ['#059669', '#10b981'],
  ['#dc2626', '#ef4444'],
  ['#d97706', '#f59e0b'],
  ['#0891b2', '#06b6d4'],
  ['#7c3aed', '#a78bfa'],
  ['#db2777', '#f472b6'],
  ['#2563eb', '#3b82f6'],
];

function hashUsername(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % AVATAR_GRADIENTS.length;
}

const SIZES = {
  sm: 'w-6 h-6 text-[9px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
} as const;

interface UserAvatarProps {
  username: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function UserAvatar({ username, size = 'md', className = '' }: UserAvatarProps) {
  const [from, to] = AVATAR_GRADIENTS[hashUsername(username)];
  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div
      className={`rounded-full flex items-center justify-center font-semibold text-white flex-shrink-0 ${SIZES[size]} ${className}`}
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials}
    </div>
  );
}
```

- [ ] **Step 2: Create ChatBubble**

```tsx
// apps/web/src/components/chat/ChatBubble.tsx
import { UserAvatar } from './UserAvatar';

interface ChatBubbleProps {
  body: string;
  isSent: boolean;
  senderUsername?: string;
  createdAt: Date | string;
}

export function ChatBubble({ body, isSent, senderUsername, createdAt }: ChatBubbleProps) {
  const time = new Date(createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  if (isSent) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-primary-foreground text-sm">
          <p className="whitespace-pre-wrap break-words">{body}</p>
          <div className="text-[10px] opacity-60 text-right mt-0.5">{time}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 items-end max-w-[75%]">
      {senderUsername && <UserAvatar username={senderUsername} size="sm" />}
      <div className="rounded-xl rounded-bl-sm bg-muted/50 px-3 py-2 text-foreground text-sm">
        <p className="whitespace-pre-wrap break-words">{body}</p>
        <div className="text-[10px] text-muted-foreground mt-0.5">{time}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create ChatMessageList**

```tsx
// apps/web/src/components/chat/ChatMessageList.tsx
import { useEffect, useRef } from 'react';
import { ChatBubble } from './ChatBubble';

interface Message {
  id: string;
  senderId: string | null;
  senderUsername: string | null;
  body: string;
  createdAt: Date | string;
}

interface ChatMessageListProps {
  messages: Message[];
  currentUserId: string;
  className?: string;
}

function formatDateSeparator(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return "Aujourd'hui";
  if (diffDays === 1) return 'Hier';
  return date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function ChatMessageList({ messages, currentUserId, className = '' }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  let lastDateKey = '';

  return (
    <div ref={containerRef} className={`flex-1 overflow-y-auto p-4 space-y-2 ${className}`}>
      {messages.map((msg) => {
        const date = new Date(msg.createdAt);
        const dateKey = getDateKey(date);
        const showSeparator = dateKey !== lastDateKey;
        lastDateKey = dateKey;

        return (
          <div key={msg.id}>
            {showSeparator && (
              <div className="text-center text-[10px] text-muted-foreground/60 my-3">
                {formatDateSeparator(date)}
              </div>
            )}
            <ChatBubble
              body={msg.body}
              isSent={msg.senderId === currentUserId}
              senderUsername={msg.senderId !== currentUserId ? (msg.senderUsername ?? undefined) : undefined}
              createdAt={msg.createdAt}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
```

- [ ] **Step 4: Create ChatInput**

```tsx
// apps/web/src/components/chat/ChatInput.tsx
import { useState, type KeyboardEvent } from 'react';

interface ChatInputProps {
  onSend: (body: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = 'Ecrire un message...' }: ChatInputProps) {
  const [value, setValue] = useState('');

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-center gap-2 p-3 border-t border-border/50">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none rounded-2xl bg-muted/30 border border-border/50 px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-40 transition-opacity flex-shrink-0"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 2L11 13" /><path d="M22 2L15 22L11 13L2 9L22 2Z" />
        </svg>
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/chat/
git commit -m "feat: add shared chat components (UserAvatar, ChatBubble, ChatMessageList, ChatInput)"
```

---

### Task 4: ConversationList and ChatView components

**Files:**
- Create: `apps/web/src/components/chat/ConversationList.tsx`
- Create: `apps/web/src/components/chat/ChatView.tsx`

- [ ] **Step 1: Create ConversationList**

```tsx
// apps/web/src/components/chat/ConversationList.tsx
import { useState } from 'react';
import { trpc } from '@/trpc';
import { UserAvatar } from './UserAvatar';

interface ConversationListProps {
  activeThreadId: string | null;
  onSelectThread: (threadId: string, otherUsername: string) => void;
  onNewConversation: (username: string) => void;
}

function formatRelative(date: Date | string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "A l'instant";
  if (diffMin < 60) return `${diffMin}min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return 'Hier';
  if (diffD < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export function ConversationList({ activeThreadId, onSelectThread, onNewConversation }: ConversationListProps) {
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState('');

  const { data: conversations } = trpc.message.conversations.useQuery();
  const { data: searchResults } = trpc.user.search.useQuery(
    { query: searchQuery },
    { enabled: searchMode && searchQuery.length >= 2 },
  );

  const filtered = filter
    ? conversations?.filter((c) => c.otherUser.username.toLowerCase().includes(filter.toLowerCase()))
    : conversations;

  return (
    <div className="flex flex-col h-full border-r border-border/30">
      {/* Header */}
      <div className="p-3 border-b border-border/30 flex items-center gap-2">
        {searchMode ? (
          <>
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un joueur..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button
              onClick={() => { setSearchMode(false); setSearchQuery(''); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Annuler
            </button>
          </>
        ) : (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filtrer..."
              className="flex-1 bg-muted/30 border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            <button
              onClick={() => setSearchMode(true)}
              className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary hover:bg-primary/30 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
            </button>
          </>
        )}
      </div>

      {/* Search results */}
      {searchMode && searchQuery.length >= 2 && (
        <div className="overflow-y-auto">
          {searchResults && searchResults.length > 0 ? (
            searchResults.map((user) => (
              <button
                key={user.id}
                onClick={() => {
                  onNewConversation(user.username);
                  setSearchMode(false);
                  setSearchQuery('');
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <UserAvatar username={user.username} size="md" />
                <span className="text-sm text-foreground">{user.username}</span>
              </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground p-4">Aucun joueur trouve</p>
          )}
        </div>
      )}

      {/* Conversation list */}
      {!searchMode && (
        <div className="flex-1 overflow-y-auto">
          {!filtered || filtered.length === 0 ? (
            <div className="p-4 text-center">
              <p className="text-sm text-muted-foreground">Aucune conversation</p>
              <button
                onClick={() => setSearchMode(true)}
                className="mt-2 text-sm text-primary hover:underline"
              >
                Nouveau message
              </button>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.threadId}
                onClick={() => onSelectThread(conv.threadId, conv.otherUser.username)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                  activeThreadId === conv.threadId ? 'bg-primary/10' : 'hover:bg-muted/30'
                }`}
              >
                <div className="relative">
                  <UserAvatar username={conv.otherUser.username} size="md" />
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline">
                    <span className={`text-sm ${conv.unreadCount > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                      {conv.otherUser.username}
                    </span>
                    <span className="text-[10px] text-muted-foreground/60 ml-2 flex-shrink-0">
                      {formatRelative(conv.lastMessage.createdAt)}
                    </span>
                  </div>
                  <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {conv.lastMessage.body}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create ChatView**

```tsx
// apps/web/src/components/chat/ChatView.tsx
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { UserAvatar } from './UserAvatar';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface ChatViewProps {
  threadId: string | null;
  otherUsername: string | null;
  onBack?: () => void;
  onThreadCreated?: (threadId: string) => void;
  className?: string;
}

export function ChatView({ threadId, otherUsername, onBack, onThreadCreated, className = '' }: ChatViewProps) {
  const userId = useAuthStore((s) => s.userId);
  const utils = trpc.useUtils();

  const { data: thread } = trpc.message.thread.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId },
  );

  const replyMutation = trpc.message.reply.useMutation({
    onSuccess: () => {
      utils.message.thread.invalidate({ threadId: threadId! });
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: (msg) => {
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
      if (msg.threadId && onThreadCreated) {
        onThreadCreated(msg.threadId);
      }
    },
  });

  if (!threadId || !otherUsername) {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <p className="text-sm text-muted-foreground">Selectionnez une conversation</p>
      </div>
    );
  }

  const handleSend = (body: string) => {
    if (thread && thread.length > 0) {
      replyMutation.mutate({ messageId: thread[thread.length - 1].id, body });
    } else {
      sendMutation.mutate({ recipientUsername: otherUsername, body });
    }
  };

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
        {onBack && (
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground mr-1">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
        )}
        <UserAvatar username={otherUsername} size="md" />
        <div>
          <div className="text-sm font-semibold text-foreground">{otherUsername}</div>
        </div>
      </div>

      {/* Messages */}
      {thread && userId ? (
        <ChatMessageList messages={thread} currentUserId={userId} className="flex-1" />
      ) : (
        <div className="flex-1" />
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={replyMutation.isPending || sendMutation.isPending}
      />
    </div>
  );
}
```

Note: the `useAuthStore` should expose `userId`. Check `apps/web/src/stores/auth.store.ts` — if `userId` is not exposed, extract it from the JWT token or add it to the store. The field is typically available from the login response.

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ConversationList.tsx apps/web/src/components/chat/ChatView.tsx
git commit -m "feat: add ConversationList and ChatView components"
```

---

### Task 5: Messages page rewrite

**Files:**
- Modify: `apps/web/src/pages/Messages.tsx` (complete rewrite)

- [ ] **Step 1: Rewrite Messages.tsx as split-panel chat**

Replace the entire content of `apps/web/src/pages/Messages.tsx`:

```tsx
import { useState } from 'react';
import { ConversationList } from '@/components/chat/ConversationList';
import { ChatView } from '@/components/chat/ChatView';

export default function Messages() {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeUsername, setActiveUsername] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  const handleSelectThread = (threadId: string, username: string) => {
    setActiveThreadId(threadId);
    setActiveUsername(username);
    setMobileView('chat');
  };

  const handleNewConversation = (username: string) => {
    setActiveThreadId(null);
    setActiveUsername(username);
    setMobileView('chat');
  };

  const handleThreadCreated = (threadId: string) => {
    setActiveThreadId(threadId);
  };

  const handleBack = () => {
    setMobileView('list');
    setActiveThreadId(null);
    setActiveUsername(null);
  };

  return (
    <div className="h-[calc(100dvh-7rem)] lg:h-[calc(100dvh-6rem)]">
      {/* Desktop: split panel */}
      <div className="hidden lg:grid grid-cols-[320px_1fr] h-full glass-card overflow-hidden rounded-xl mx-4 mt-4">
        <ConversationList
          activeThreadId={activeThreadId}
          onSelectThread={handleSelectThread}
          onNewConversation={handleNewConversation}
        />
        <ChatView
          threadId={activeThreadId}
          otherUsername={activeUsername}
          onThreadCreated={handleThreadCreated}
        />
      </div>

      {/* Mobile: list or chat */}
      <div className="lg:hidden h-full">
        {mobileView === 'list' ? (
          <ConversationList
            activeThreadId={null}
            onSelectThread={handleSelectThread}
            onNewConversation={handleNewConversation}
          />
        ) : (
          <ChatView
            threadId={activeThreadId}
            otherUsername={activeUsername}
            onBack={handleBack}
            onThreadCreated={handleThreadCreated}
            className="h-full"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Manual test**

Open the app in browser, navigate to /messages. Verify:
- Desktop: split panel with conversation list left, chat right
- Clicking a conversation loads the thread
- Sending a message works (reply in existing thread)
- "+" button opens search, selecting a user opens a new chat
- Mobile: list view, tap opens chat, back button returns

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/pages/Messages.tsx
git commit -m "feat: rewrite Messages page as Messenger-style split-panel chat"
```

---

### Task 6: Chat overlay store and components

**Files:**
- Create: `apps/web/src/stores/chat.store.ts`
- Create: `apps/web/src/components/chat/ChatOverlayWindow.tsx`
- Create: `apps/web/src/components/chat/ChatOverlay.tsx`

- [ ] **Step 1: Create chat Zustand store**

```ts
// apps/web/src/stores/chat.store.ts
import { create } from 'zustand';

interface ChatWindow {
  userId: string;
  username: string;
  threadId: string | null;
  minimized: boolean;
}

interface ChatStore {
  windows: ChatWindow[];
  openChat: (userId: string, username: string, threadId?: string | null) => void;
  closeChat: (userId: string) => void;
  minimizeChat: (userId: string) => void;
  expandChat: (userId: string) => void;
  setThreadId: (userId: string, threadId: string) => void;
}

const MAX_WINDOWS = 3;

export const useChatStore = create<ChatStore>((set) => ({
  windows: [],

  openChat: (userId, username, threadId = null) =>
    set((state) => {
      const existing = state.windows.find((w) => w.userId === userId);
      if (existing) {
        return {
          windows: state.windows.map((w) =>
            w.userId === userId ? { ...w, minimized: false, threadId: threadId ?? w.threadId } : w,
          ),
        };
      }
      const windows = [...state.windows, { userId, username, threadId, minimized: false }];
      if (windows.length > MAX_WINDOWS) windows.shift();
      return { windows };
    }),

  closeChat: (userId) =>
    set((state) => ({ windows: state.windows.filter((w) => w.userId !== userId) })),

  minimizeChat: (userId) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.userId === userId ? { ...w, minimized: true } : w,
      ),
    })),

  expandChat: (userId) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.userId === userId ? { ...w, minimized: false } : w,
      ),
    })),

  setThreadId: (userId, threadId) =>
    set((state) => ({
      windows: state.windows.map((w) =>
        w.userId === userId ? { ...w, threadId } : w,
      ),
    })),
}));
```

- [ ] **Step 2: Create ChatOverlayWindow**

```tsx
// apps/web/src/components/chat/ChatOverlayWindow.tsx
import { trpc } from '@/trpc';
import { useAuthStore } from '@/stores/auth.store';
import { useChatStore } from '@/stores/chat.store';
import { UserAvatar } from './UserAvatar';
import { ChatMessageList } from './ChatMessageList';
import { ChatInput } from './ChatInput';

interface ChatOverlayWindowProps {
  userId: string;
  username: string;
  threadId: string | null;
}

export function ChatOverlayWindow({ userId: otherUserId, username, threadId }: ChatOverlayWindowProps) {
  const currentUserId = useAuthStore((s) => s.userId);
  const { closeChat, minimizeChat, setThreadId } = useChatStore();
  const utils = trpc.useUtils();

  const { data: thread } = trpc.message.thread.useQuery(
    { threadId: threadId! },
    { enabled: !!threadId },
  );

  const replyMutation = trpc.message.reply.useMutation({
    onSuccess: () => {
      utils.message.thread.invalidate({ threadId: threadId! });
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  const sendMutation = trpc.message.send.useMutation({
    onSuccess: (msg) => {
      if (msg.threadId) {
        setThreadId(otherUserId, msg.threadId);
        utils.message.thread.invalidate({ threadId: msg.threadId });
      }
      utils.message.conversations.invalidate();
      utils.message.unreadCount.invalidate();
    },
  });

  const handleSend = (body: string) => {
    if (thread && thread.length > 0) {
      replyMutation.mutate({ messageId: thread[thread.length - 1].id, body });
    } else {
      sendMutation.mutate({ recipientUsername: username, body });
    }
  };

  return (
    <div className="w-[300px] h-[400px] flex flex-col rounded-t-xl overflow-hidden border border-border/30 bg-card shadow-xl">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-primary/20 cursor-pointer"
        onClick={() => minimizeChat(otherUserId)}
      >
        <UserAvatar username={username} size="sm" />
        <span className="text-sm font-semibold text-foreground flex-1 truncate">{username}</span>
        <button
          onClick={(e) => { e.stopPropagation(); minimizeChat(otherUserId); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14" /></svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); closeChat(otherUserId); }}
          className="text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      {thread && currentUserId ? (
        <ChatMessageList messages={thread} currentUserId={currentUserId} className="flex-1" />
      ) : (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Debut de conversation
        </div>
      )}

      {/* Input */}
      <ChatInput
        onSend={handleSend}
        disabled={replyMutation.isPending || sendMutation.isPending}
        placeholder="Aa"
      />
    </div>
  );
}
```

- [ ] **Step 3: Create ChatOverlay**

```tsx
// apps/web/src/components/chat/ChatOverlay.tsx
import { useLocation } from 'react-router';
import { useChatStore } from '@/stores/chat.store';
import { UserAvatar } from './UserAvatar';
import { ChatOverlayWindow } from './ChatOverlayWindow';

export function ChatOverlay() {
  const { pathname } = useLocation();
  const { windows, expandChat, closeChat } = useChatStore();

  // Hide on /messages page (page takes over) and on mobile
  if (pathname === '/messages') return null;

  const expanded = windows.filter((w) => !w.minimized);
  const minimized = windows.filter((w) => w.minimized);

  return (
    <div className="hidden lg:flex fixed bottom-0 right-4 z-30 items-end gap-2">
      {/* Expanded windows */}
      {expanded.map((w) => (
        <ChatOverlayWindow
          key={w.userId}
          userId={w.userId}
          username={w.username}
          threadId={w.threadId}
        />
      ))}

      {/* Minimized bubbles */}
      {minimized.map((w) => (
        <button
          key={w.userId}
          onClick={() => expandChat(w.userId)}
          className="relative mb-2"
          title={w.username}
        >
          <UserAvatar username={w.username} size="lg" className="shadow-lg cursor-pointer hover:scale-105 transition-transform" />
          <button
            onClick={(e) => { e.stopPropagation(); closeChat(w.userId); }}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-muted border border-border flex items-center justify-center text-muted-foreground hover:text-foreground"
          >
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/stores/chat.store.ts apps/web/src/components/chat/ChatOverlay.tsx apps/web/src/components/chat/ChatOverlayWindow.tsx
git commit -m "feat: add chat overlay store and components (desktop floating windows)"
```

---

### Task 7: Layout integration and notification wiring

**Files:**
- Modify: `apps/web/src/components/layout/Layout.tsx`
- Modify: `apps/web/src/hooks/useNotifications.ts`

- [ ] **Step 1: Mount ChatOverlay in Layout**

In `apps/web/src/components/layout/Layout.tsx`, add import and component:

```tsx
import { ChatOverlay } from '@/components/chat/ChatOverlay';
```

Add `<ChatOverlay />` just before `<Toaster />` in the JSX:

```tsx
      <BottomTabBar />
      <ChatOverlay />
      <Toaster />
```

- [ ] **Step 2: Update useNotifications for chat**

In `apps/web/src/hooks/useNotifications.ts`, update the `new-message` case:

Add import at top:
```ts
import { useChatStore } from '@/stores/chat.store';
```

Inside `useNotifications()`, get the store:
```ts
const openChat = useChatStore((s) => s.openChat);
```

Update the `new-message` case:

```ts
case 'new-message':
  utils.message.inbox.invalidate();
  utils.message.conversations.invalidate();
  utils.message.unreadCount.invalidate();
  // Open minimized chat bubble on desktop if it's a player message
  if (event.payload.type === 'player' && event.payload.senderId && event.payload.senderUsername) {
    // Only add as minimized bubble — don't interrupt the user
    const chatStore = useChatStore.getState();
    const alreadyOpen = chatStore.windows.find((w) => w.userId === event.payload.senderId);
    if (!alreadyOpen) {
      chatStore.openChat(String(event.payload.senderId), String(event.payload.senderUsername));
      chatStore.minimizeChat(String(event.payload.senderId));
    } else if (alreadyOpen.threadId) {
      // Refresh the thread if the conversation is already open
      utils.message.thread.invalidate({ threadId: alreadyOpen.threadId });
    }
  }
  addToast(`Message de ${event.payload.senderUsername ?? 'un joueur'}`);
  showBrowserNotification('Nouveau message', String(event.payload.senderUsername ?? 'Nouveau message'));
  break;
```

Note: Use `useChatStore.getState()` inside the SSE callback instead of the hook, since the SSE handler is a stable ref and won't re-render on store changes.

- [ ] **Step 3: Verify build**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Manual end-to-end test**

1. Open the app on desktop, go to Overview
2. Receive a message (from another player or test) — verify minimized bubble appears bottom-right
3. Click the bubble — chat window expands with the conversation
4. Send a reply — verify it appears in the chat
5. Navigate to /messages — verify overlay hides, split panel shows
6. Click "+" to search a player, start a new conversation
7. On mobile — verify overlay is hidden, /messages shows list then chat

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/layout/Layout.tsx apps/web/src/hooks/useNotifications.ts
git commit -m "feat: mount chat overlay in layout, wire SSE notifications for real-time chat"
```

- [ ] **Step 6: Push**

```bash
git push
```
