import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProfileBioCardProps {
  bio: string | null;
  isOwn: boolean;
  onSave?: (next: string | null) => void;
  isSaving?: boolean;
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
          <Pencil className="h-3.5 w-3.5" />
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
