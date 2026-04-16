import { useState, useEffect, useRef } from 'react';
import { fetchWithAuth } from '@/trpc';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Upload, Trash2, Loader2, ImagePlus } from 'lucide-react';

export default function Portraits() {
  const [avatars, setAvatars] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [newId, setNewId] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function fetchAvatars() {
    try {
      const res = await fetchWithAuth('/admin/avatars');
      const data = await res.json();
      setAvatars(data.avatars ?? []);
    } catch {
      setAvatars([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAvatars(); }, []);

  function toKebab(str: string): string {
    return str
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
  }

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    const id = toKebab(newId.trim());
    if (!file || !id) return;

    if (avatars.includes(id)) {
      alert(`Un portrait avec l'ID "${id}" existe deja.`);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('category', 'avatars');
      formData.append('entityId', id);
      formData.append('file', file);

      const res = await fetchWithAuth('/admin/upload-asset', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Upload failed');
        return;
      }

      setNewId('');
      if (fileRef.current) fileRef.current.value = '';
      await fetchAvatars();
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetchWithAuth(`/admin/avatars/${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Delete failed');
        return;
      }
      await fetchAvatars();
    } catch {
      alert('Delete failed');
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-100">Portraits</h1>
          <p className="text-sm text-gray-500 mt-1">
            {loading ? '...' : `${avatars.length} portrait${avatars.length !== 1 ? 's' : ''} disponible${avatars.length !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {/* Upload form */}
      <div className="admin-card p-4 mb-6">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-400 mb-1">Identifiant</label>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder="ex: commander-alpha"
              className="admin-input w-full"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-400 mb-1">Image</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-panel-hover file:text-gray-300 hover:file:bg-panel-border file:cursor-pointer"
            />
          </div>
          <button
            onClick={handleUpload}
            disabled={uploading || !newId.trim()}
            className="admin-btn-primary flex items-center gap-2"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Ajouter
          </button>
        </div>
        {newId.trim() && (
          <div className="mt-2 text-xs text-gray-500">
            ID final : <span className="text-gray-300 font-mono">{toKebab(newId.trim())}</span>
          </div>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-gray-500 text-sm">Chargement...</div>
      ) : avatars.length === 0 ? (
        <div className="admin-card p-12 flex flex-col items-center text-gray-500">
          <ImagePlus className="w-10 h-10 mb-3 opacity-40" />
          <p className="text-sm">Aucun portrait. Ajoutez-en un ci-dessus.</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
          {avatars.map((id) => (
            <div key={id} className="group relative">
              <div className="aspect-square rounded-lg overflow-hidden border border-panel-border bg-panel">
                <img
                  src={`/assets/avatars/${id}.webp?t=${Date.now()}`}
                  alt={id}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
              <div className="mt-1 text-[10px] font-mono text-gray-500 truncate" title={id}>
                {id}
              </div>
              <button
                onClick={() => setDeleteTarget(id)}
                className="absolute top-1 right-1 p-1 rounded bg-black/60 text-gray-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Supprimer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer ce portrait ?"
        message={`Le portrait "${deleteTarget}" sera supprime. Les joueurs qui l'utilisent verront leurs initiales a la place.`}
        confirmLabel={deleting ? 'Suppression...' : 'Supprimer'}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
