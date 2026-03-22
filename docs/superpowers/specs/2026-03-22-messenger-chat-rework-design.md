# Messenger Chat Rework - Design Spec

## Goal

Replace the email-style Messages page with a Messenger-like chat interface. Player-to-player conversations only, with messages displayed in alternating left/right bubbles. Add a desktop overlay (up to 3 floating chat windows) accessible from any page.

## Architecture

Frontend-heavy rework: replace `Messages.tsx` with a split-panel chat page, add a `ChatOverlay` component in the root layout. Backend changes are limited to 2 new endpoints (`message.conversations`, `user.search`) and minor adjustments to `message.send`. Existing endpoints remain for backward compatibility.

## Decisions

- **Layout**: Split panel (conversation list left, chat right) on desktop. Full-width list with tap-to-open on mobile.
- **Messages systeme**: Removed from chat entirely. System messages (combat, espionage, colonization, missions) remain accessible via notifications/reports only.
- **Overlay**: Up to 3 floating chat windows on desktop (bottom-right), minimizable to avatar bubbles. Not shown on mobile.
- **New conversation**: Button "+" in the conversation list opens an autocomplete search on username.
- **No subjects**: Chat messages have no subject line. The `subject` field is auto-generated internally.

## API Changes

### New: `message.conversations`

Returns grouped threads for the current user (player messages only).

```
Input: (none)
Output: Array<{
  threadId: string
  otherUser: { id: string, username: string }
  lastMessage: { body: string, senderId: string, createdAt: Date }
  unreadCount: number
}>
```

SQL logic: group by `threadId`, filter `type = 'player'`, join `users` for the other participant. Order by `lastMessage.createdAt` desc.

### New: `user.search`

Autocomplete for usernames.

```
Input: { query: string } (min 2 chars)
Output: Array<{ id: string, username: string }> (limit 10)
```

ILIKE on `users.username`, exclude current user.

### Modified: `message.send`

The `subject` parameter is no longer required from the frontend. Auto-generate it from the body (truncated) for internal storage. Signature becomes:

```
Input: {
  recipientUsername: string
  body: string
}
```

### Unchanged

- `message.thread` — already returns all messages in a thread chronologically, marks as read. Used as-is for the chat view.
- `message.reply` — already handles replying within a thread. Used as-is.
- `message.unreadCount` — used for badge display.
- `message.inbox`, `message.sent`, `message.detail` — kept for backward compatibility but no longer called by the new frontend.

## Frontend — Page /messages

### Desktop (lg+)

Split layout: `grid-cols-[320px_1fr]`.

**Left panel — `ConversationList`:**
- Search bar at top (filters existing conversations locally)
- "+" button to start a new conversation (switches to autocomplete mode using `user.search`)
- Conversation items: `UserAvatar` (initials + hashed color), username, last message preview (truncated), relative date, unread badge
- Active conversation highlighted

**Right panel — `ChatView`:**
- Header: avatar + username + coordinates if available
- Scrollable message area with auto-scroll-to-bottom
- Messages as bubbles: received left (muted background), sent right (primary background), asymmetric border-radius
- Avatar on received messages only
- Date separators ("Aujourd'hui", "Hier", "Lun. 17 mars")
- Input bar at bottom: rounded field + send button

### Mobile (<lg)

- Initial state: `ConversationList` full-width
- Tap on conversation: `ChatView` full-screen with back button
- Same components, only the view switching logic differs

### Empty states

- No conversations: illustration + "Aucune conversation" + "Nouveau message" button
- No conversation selected (desktop): placeholder text in the right panel

## Frontend — Desktop Overlay

### `ChatOverlayProvider`

React context mounted in the root layout. Exposes:
- `openChat(userId: string, username: string)` — opens or focuses a chat window
- `closeChat(userId: string)` — removes from overlay
- `minimizeChat(userId: string)` — collapses to avatar bubble

State: `Map<userId, { username: string, minimized: boolean }>`. Max 3 entries; opening a 4th closes the oldest.

### Rendering

- Position: `fixed bottom-0 right-4`, flex row-reverse, gap between windows
- Each window: 300px wide, ~400px tall
  - Clickable header (collapse/expand): avatar + username + minimize button + close button
  - Body: reuses `ChatMessageList` and `ChatInput` components from the page
  - Input at bottom
- Minimized: avatar bubble with unread badge
- Hidden on `/messages` page (page takes over)
- Hidden on mobile (redirect to /messages instead)

### Triggers

- Click on minimized bubble in overlay
- SSE `new-message` notification: if conversation not open, add minimized bubble with badge
- Galaxy view: "Message" button on a player calls `openChat(userId, username)`

## Shared Components

Components reused between the page and the overlay:

- **`UserAvatar`**: Renders initials with a gradient background color hashed from the username. Consistent color across all views. Props: `username: string, size: 'sm' | 'md' | 'lg'`.
- **`ChatBubble`**: Single message bubble. Props: `body, isSent, senderUsername?, createdAt`. Sent = right-aligned primary bg, received = left-aligned muted bg with avatar.
- **`ChatMessageList`**: Scrollable list of `ChatBubble` with date separators. Auto-scrolls to bottom on new messages. Props: `messages[], currentUserId`.
- **`ChatInput`**: Rounded text input + send button. Props: `onSend(body: string), disabled?`.

## Real-time & Notifications

- SSE `new-message` already exists. On receive:
  - If conversation open (page or overlay): append message + auto-scroll
  - If not open (desktop): add minimized bubble in overlay with badge
  - If not open (mobile): badge increment only
  - Invalidate `message.conversations` to refresh list ordering
- Mark as read: handled by `message.thread` API call when opening a conversation. Invalidate `unreadCount` after.

## Deletions

- No individual message deletion in the chat UI
- Delete entire conversation: context menu or swipe, with confirmation dialog. Calls existing `message.delete` for each message in the thread (or a new batch delete endpoint if needed).

## Avatar Colors

Hash the username to an index in a palette of 8 predefined gradients:

```ts
const AVATAR_GRADIENTS = [
  ['#6366f1', '#8b5cf6'], // indigo-violet
  ['#059669', '#10b981'], // emerald
  ['#dc2626', '#ef4444'], // red
  ['#d97706', '#f59e0b'], // amber
  ['#0891b2', '#06b6d4'], // cyan
  ['#7c3aed', '#a78bfa'], // purple
  ['#db2777', '#f472b6'], // pink
  ['#2563eb', '#3b82f6'], // blue
];
```

## Out of Scope

- Group chats / multi-user conversations
- Message reactions / emojis
- Typing indicators
- Online/offline status
- File/image attachments
- Read receipts (vu)
- Player profile pages
