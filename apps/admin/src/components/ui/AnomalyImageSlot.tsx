import { useState, useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { fetchWithAuth } from '@/trpc';

interface AnomalyImageSlotProps {
  /** Slot key — alphanum + `-` / `_` only (e.g. `depth-1`, `event-foo`). */
  slot: string;
  /** Current public path (typically `/assets/anomaly/<slot>.webp`). */
  value: string;
  /** Suggested aspect ratio for the preview tile. */
  aspect?: string;
  label: string;
  hint?: string;
  onChange: (path: string) => void;
}

/**
 * Upload widget for an Anomaly content slot. Uploads via `/admin/upload-asset`
 * with `category=anomaly`, then reports the resulting public path back via
 * `onChange`. Mirrors the homepage slot pattern but lives in its own file
 * so the two domains evolve independently.
 */
export function AnomalyImageSlot({
  slot,
  value,
  aspect = '16/9',
  label,
  hint,
  onChange,
}: AnomalyImageSlotProps) {
  const [uploading, setUploading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [cacheBust, setCacheBust] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const previewUrl = value
    ? `${value}${cacheBust ? `?t=${cacheBust}` : ''}`
    : null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrored(false);
    const fd = new FormData();
    fd.append('category', 'anomaly');
    fd.append('entityId', slot);
    fd.append('file', file);

    try {
      const res = await fetchWithAuth('/admin/upload-asset', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? 'Upload échoué');
        return;
      }
      const path = `/assets/anomaly/${slot}.webp`;
      onChange(path);
      setCacheBust(String(Date.now()));
    } catch {
      alert('Upload échoué');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-mono uppercase tracking-wider text-gray-400">
          {label}
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-red-400"
          >
            <X className="h-3 w-3" /> Vider
          </button>
        )}
      </div>

      <div
        className="relative overflow-hidden rounded-md border border-dashed border-panel-border bg-panel/50"
        style={{ aspectRatio: aspect }}
      >
        {previewUrl && !errored ? (
          <img
            src={previewUrl}
            alt={label}
            className="h-full w-full object-cover"
            onError={() => setErrored(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs font-mono text-gray-600">
            {value ? 'Image manquante' : 'Aucune image'}
          </div>
        )}

        {uploading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 className="h-5 w-5 animate-spin text-hull-400" />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded border border-hull-700/40 bg-hull-900/30 px-2 py-1 text-xs text-hull-300 transition-colors hover:bg-hull-900/60"
          disabled={uploading}
        >
          <Upload className="h-3 w-3" /> {value ? 'Remplacer' : 'Uploader'}
        </button>
        {hint && <span className="text-[10px] text-gray-600">{hint}</span>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={onFile}
        className="hidden"
      />
    </div>
  );
}
