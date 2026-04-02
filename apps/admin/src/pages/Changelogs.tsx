import { useState, useRef, useCallback } from 'react';
import { trpc } from '@/trpc';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Pencil, Trash2, Eye, EyeOff, Sparkles, X, Bold, Heading3, List, Minus } from 'lucide-react';

// ── Simple Markdown Preview ──
function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let listItems: string[] = [];
  let key = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={key++} className="space-y-0.5 mb-2 ml-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm text-gray-300 flex gap-2">
              <span className="text-gray-500 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: inlineBold(item) }} />
            </li>
          ))}
        </ul>
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    if (line.startsWith('### ')) {
      flushList();
      elements.push(<h3 key={key++} className="text-sm font-semibold text-gray-100 mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ')) {
      listItems.push(line.slice(2));
    } else if (line.trim() === '') {
      flushList();
    } else {
      flushList();
      elements.push(<p key={key++} className="text-sm text-gray-300 mb-1" dangerouslySetInnerHTML={{ __html: inlineBold(line) }} />);
    }
  }
  flushList();
  return <>{elements}</>;
}

function inlineBold(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-gray-100 font-semibold">$1</strong>');
}

// ── Markdown Editor with toolbar ──
function MarkdownEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [tab, setTab] = useState<'edit' | 'preview'>('edit');

  const insertAt = useCallback((before: string, after: string = '') => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const replacement = before + (selected || 'texte') + after;
    const newValue = value.slice(0, start) + replacement + value.slice(end);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      const cursorPos = start + before.length;
      ta.setSelectionRange(cursorPos, cursorPos + (selected || 'texte').length);
    });
  }, [value, onChange]);

  const insertLine = useCallback((prefix: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    // Find start of current line
    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
    const newValue = value.slice(0, lineStart) + prefix + value.slice(lineStart);
    onChange(newValue);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }, [value, onChange]);

  return (
    <div>
      <div className="flex items-center justify-between border-b border-gray-700 mb-0">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 p-1">
          <button type="button" onClick={() => insertAt('**', '**')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200" title="Gras">
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => insertLine('### ')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200" title="Titre">
            <Heading3 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => insertLine('- ')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200" title="Liste">
            <List className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => insertLine('---\n')} className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-gray-200" title="Separateur">
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-0.5 p-1">
          <button
            type="button"
            onClick={() => setTab('edit')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'edit' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Editeur
          </button>
          <button
            type="button"
            onClick={() => setTab('preview')}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${tab === 'preview' ? 'bg-gray-700 text-gray-200' : 'text-gray-500 hover:text-gray-300'}`}
          >
            Apercu
          </button>
        </div>
      </div>

      {tab === 'edit' ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="admin-input font-mono text-sm min-h-[350px] resize-y rounded-t-none border-t-0"
          rows={18}
        />
      ) : (
        <div className="admin-input min-h-[350px] rounded-t-none border-t-0 overflow-y-auto">
          {value.trim() ? <MarkdownPreview content={value} /> : <p className="text-gray-500 text-sm italic">Rien a afficher</p>}
        </div>
      )}
    </div>
  );
}

function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + '...';
}

export default function Changelogs() {
  const [editItem, setEditItem] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', published: false });
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data, isLoading, refetch } = trpc.changelog.admin.list.useQuery();

  const generateMutation = trpc.changelog.admin.generate.useMutation({
    onSuccess: () => refetch(),
  });

  const updateMutation = trpc.changelog.admin.update.useMutation({
    onSuccess: () => { refetch(); setEditItem(null); },
  });

  const deleteMutation = trpc.changelog.admin.delete.useMutation({
    onSuccess: () => { refetch(); setDeleteId(null); },
  });

  const handleEdit = (item: any) => {
    setEditItem(item);
    setEditForm({ title: item.title ?? '', content: item.content ?? '', published: !!item.published });
  };

  const handleSave = () => {
    if (!editItem) return;
    updateMutation.mutate({
      id: editItem.id,
      title: editForm.title,
      content: editForm.content,
      published: editForm.published,
    });
  };

  const handleTogglePublish = (item: any) => {
    updateMutation.mutate({ id: item.id, published: !item.published });
  };

  if (isLoading) return <PageSkeleton />;

  const items = data ?? [];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-gray-100">Journal de developpement</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">{items.length} entree{items.length > 1 ? 's' : ''}</span>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="admin-btn-primary flex items-center gap-1.5 text-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {generateMutation.isPending ? 'Generation...' : 'Generer'}
          </button>
        </div>
      </div>

      <div className="admin-card overflow-x-auto">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Titre</th>
              <th>Statut</th>
              <th>Commentaires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item: any) => (
              <tr key={item.id}>
                <td className="text-sm text-gray-400 whitespace-nowrap">{formatDate(item.date ?? item.createdAt)}</td>
                <td className="font-medium max-w-[300px] truncate">{truncate(item.title ?? '', 60)}</td>
                <td>
                  <button
                    onClick={() => handleTogglePublish(item)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                      item.published
                        ? 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
                        : 'bg-amber-900/40 text-amber-400 hover:bg-amber-900/60'
                    }`}
                  >
                    {item.published ? 'Publie' : 'Brouillon'}
                  </button>
                </td>
                <td className="font-mono text-sm text-center">{item.commentCount ?? item._count?.comments ?? 0}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(item)}
                      className="admin-btn-ghost p-1.5"
                      title="Modifier"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleTogglePublish(item)}
                      className="admin-btn-ghost p-1.5"
                      title={item.published ? 'Depublier' : 'Publier'}
                    >
                      {item.published ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setDeleteId(item.id)}
                      className="admin-btn-ghost p-1.5 text-red-500"
                      title="Supprimer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-gray-500 py-8">Aucun changelog.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in">
          <form
            onSubmit={(e) => { e.preventDefault(); handleSave(); }}
            className="admin-card p-6 max-w-2xl w-full mx-4 max-h-[85vh] overflow-y-auto animate-slide-up shadow-2xl"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-100">Modifier le changelog</h3>
              <button type="button" onClick={() => setEditItem(null)} className="text-gray-500 hover:text-gray-300">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Titre</label>
                <input
                  type="text"
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Contenu</label>
                <MarkdownEditor
                  value={editForm.content}
                  onChange={(v) => setEditForm({ ...editForm, content: v })}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="published-toggle"
                  checked={editForm.published}
                  onChange={(e) => setEditForm({ ...editForm, published: e.target.checked })}
                  className="rounded border-gray-600 bg-panel-dark text-hull-500 focus:ring-hull-500"
                />
                <label htmlFor="published-toggle" className="text-sm text-gray-400">
                  Publie
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={() => setEditItem(null)} className="admin-btn-ghost">
                Annuler
              </button>
              <button type="submit" disabled={updateMutation.isPending} className="admin-btn-primary">
                {updateMutation.isPending ? 'Sauvegarde...' : 'Sauvegarder'}
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Supprimer ce changelog ?"
        message="Cette action est irreversible. Le changelog et tous ses commentaires seront supprimes."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => { if (deleteId) deleteMutation.mutate({ id: deleteId }); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
