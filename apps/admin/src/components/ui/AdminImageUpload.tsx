import { useState, useRef } from 'react';
import { fetchWithAuth } from '@/trpc';
import { Loader2 } from 'lucide-react';

type AssetCategory = 'buildings' | 'research' | 'ships' | 'defenses';

interface AdminImageUploadProps {
  category: AssetCategory;
  entityId: string;
  entityName: string;
}

// Must match toKebab in apps/web/src/lib/assets.ts
function toKebab(id: string): string {
  return id.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
}

export function AdminImageUpload({ category, entityId, entityName }: AdminImageUploadProps) {
  const [error, setError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cacheBust, setCacheBust] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const iconUrl = `/assets/${category}/${toKebab(entityId)}-icon.webp${cacheBust ? `?t=${cacheBust}` : ''}`;

  const handleClick = () => {
    inputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(false);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('entityId', entityId);

    try {
      const res = await fetchWithAuth('/admin/upload-asset', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Upload failed');
        return;
      }

      setCacheBust(String(Date.now()));
      setError(false);
    } catch {
      alert('Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const initial = entityName.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={handleClick}
      className="relative w-10 h-10 rounded border border-panel-border hover:border-hull-400 transition-colors cursor-pointer overflow-hidden flex-shrink-0"
      title={`Upload image for ${entityName}`}
    >
      {uploading && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <Loader2 className="w-4 h-4 text-hull-400 animate-spin" />
        </div>
      )}

      {error ? (
        <div className="w-full h-full flex items-center justify-center bg-panel text-gray-500 text-xs font-mono border border-dashed border-panel-border">
          {initial}
        </div>
      ) : (
        <img
          src={iconUrl}
          alt={entityName}
          className="w-full h-full object-cover"
          onError={() => setError(true)}
        />
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
    </button>
  );
}
