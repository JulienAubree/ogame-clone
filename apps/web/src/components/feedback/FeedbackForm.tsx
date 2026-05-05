import { useState } from 'react';
import { useLocation } from 'react-router';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { trpc } from '@/trpc';

const TYPE_OPTIONS = [
  {
    value: 'bug' as const,
    emoji: '🐛',
    label: 'Bug',
    description: 'Quelque chose ne fonctionne pas',
    titlePlaceholder: 'Décrivez le bug en une phrase',
    descPlaceholder: 'Étapes pour reproduire le bug, ce que vous attendiez, ce qui s\'est passé...',
  },
  {
    value: 'idea' as const,
    emoji: '💡',
    label: 'Idée',
    description: 'Proposer une amélioration',
    titlePlaceholder: 'Résumez votre idée en une phrase',
    descPlaceholder: 'Décrivez votre idée en détail. Quel problème résout-elle ? Comment imaginez-vous son fonctionnement ?',
  },
  {
    value: 'feedback' as const,
    emoji: '💬',
    label: 'Feedback',
    description: 'Retour général sur le jeu',
    titlePlaceholder: 'Sujet de votre retour',
    descPlaceholder: 'Partagez votre ressenti, ce que vous aimez, ce qui pourrait être amélioré...',
  },
];

interface FeedbackFormProps {
  open: boolean;
  onClose: () => void;
}

export function FeedbackForm({ open, onClose }: FeedbackFormProps) {
  const [type, setType] = useState<'bug' | 'idea' | 'feedback' | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [includePage, setIncludePage] = useState(true);

  const location = useLocation();
  // Capture once when the modal opens — avoids racing with the user
  // navigating around in another tab while writing the report.
  const [capturedPagePath] = useState(() => location.pathname + (location.search ?? ''));

  const utils = trpc.useUtils();
  const createMutation = trpc.feedback.create.useMutation({
    onSuccess: () => {
      utils.feedback.list.invalidate();
      utils.feedback.myList.invalidate();
      resetAndClose();
    },
  });

  const selectedType = TYPE_OPTIONS.find(t => t.value === type);

  function resetAndClose() {
    setType(null);
    setTitle('');
    setDescription('');
    setIncludePage(true);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !title.trim() || !description.trim()) return;
    createMutation.mutate({
      type,
      title: title.trim(),
      description: description.trim(),
      pagePath: includePage ? capturedPagePath : undefined,
    });
  }

  return (
    <Modal open={open} onClose={resetAndClose} title="Soumettre un feedback">
      {!type ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">De quel type est votre retour ?</p>
          <div className="grid gap-2">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className="flex items-center gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/30"
              >
                <span className="text-2xl">{opt.emoji}</span>
                <div>
                  <div className="text-sm font-medium text-foreground">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.description}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <button
            type="button"
            onClick={() => setType(null)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Changer de type
          </button>

          <div className="flex items-center gap-2">
            <span className="text-lg">{selectedType!.emoji}</span>
            <span className="text-sm font-medium">{selectedType!.label}</span>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-title" className="text-xs font-medium text-muted-foreground">Titre</label>
            <Input
              id="feedback-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={selectedType!.titlePlaceholder}
              maxLength={200}
            />
            <div className="text-right text-[10px] text-muted-foreground">{title.length}/200</div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="feedback-desc" className="text-xs font-medium text-muted-foreground">Description</label>
            <textarea
              id="feedback-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={selectedType!.descPlaceholder}
              maxLength={2000}
              rows={4}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <div className="text-right text-[10px] text-muted-foreground">{description.length}/2000</div>
          </div>

          <label className="flex items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2.5 cursor-pointer hover:bg-card/60 transition-colors">
            <input
              type="checkbox"
              checked={includePage}
              onChange={(e) => setIncludePage(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-primary cursor-pointer"
            />
            <div className="flex-1 min-w-0 text-xs">
              <div className="font-medium text-foreground">Inclure la page consultée</div>
              <div className="text-muted-foreground font-mono truncate">
                {capturedPagePath}
              </div>
            </div>
          </label>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={resetAndClose}>Annuler</Button>
            <Button
              type="submit"
              disabled={!title.trim() || !description.trim() || createMutation.isPending}
            >
              {createMutation.isPending ? 'Envoi...' : 'Soumettre'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
