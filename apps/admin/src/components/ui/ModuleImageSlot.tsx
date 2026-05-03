import { useState, useRef } from 'react';
import { Loader2, Upload, X } from 'lucide-react';
import { fetchWithAuth } from '@/trpc';

interface ModuleImageSlotProps {
  /** Slot key — alphanum + `-` / `_` only (e.g. `module-id`). */
  slot: string;
  /**
   * Current basename WITHOUT extension (typically `/assets/module/<slot>`).
   * The image-processing pipeline writes both `<base>.webp` and
   * `<base>-thumb.webp` to disk, and the web consumers append the suffix
   * themselves (`${module.image}-thumb.webp` etc.). Storing the basename
   * keeps both consumers symmetric and avoids `.webp.webp` paths.
   */
  value: string;
  /** Suggested aspect ratio for the preview tile. */
  aspect?: string;
  label: string;
  hint?: string;
  onChange: (path: string) => void;
}

/**
 * Upload widget for a Module content slot. Uploads via `/admin/upload-asset`
 * with `category=module`, then reports the resulting basename (NO extension)
 * back via `onChange`. The web consumers append `.webp` / `-thumb.webp`
 * themselves (see `ModuleSlot.tsx`, `ModuleDetailModal.tsx`,
 * `AnomalyLootSummaryModal.tsx`).
 */
export function ModuleImageSlot({
  slot,
  value,
  aspect = '16/9',
  label,
  hint,
  onChange,
}: ModuleImageSlotProps) {
  const [uploading, setUploading] = useState(false);
  const [errored, setErrored] = useState(false);
  const [cacheBust, setCacheBust] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // The DB value is a basename without extension; we append `.webp` only for
  // the preview <img>. Cache-bust uses a query string so the browser refreshes
  // after a re-upload to the same slot.
  const previewUrl = value
    ? `${value}.webp${cacheBust ? `?t=${cacheBust}` : ''}`
    : null;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setErrored(false);
    const fd = new FormData();
    fd.append('category', 'module');
    fd.append('entityId', slot);
    fd.append('file', file);

    try {
      const res = await fetchWithAuth('/admin/upload-asset', { method: 'POST', body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? 'Upload échoué');
        return;
      }
      // Store the basename WITHOUT extension so `${module.image}-thumb.webp`
      // and `${module.image}.webp` (web consumers) resolve correctly.
      const path = `/assets/module/${slot}`;
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
