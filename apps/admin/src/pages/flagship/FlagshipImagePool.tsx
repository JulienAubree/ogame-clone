import { useState, useEffect } from 'react';
import { fetchWithAuth } from '@/trpc';
import { AdminImageUpload } from '@/components/ui/AdminImageUpload';
import { Ship } from 'lucide-react';
import { HULL_TYPES } from './constants';

function FlagshipHullImages({ hullId, label, color }: { hullId: string; label: string; color: string }) {
  const [images, setImages] = useState<{ index: number; thumbUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const loadImages = async () => {
    try {
      const res = await fetchWithAuth(`/admin/flagship-images/${hullId}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data.images);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadImages(); }, [hullId]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${color}`}>{label}</span>
        <span className="text-xs text-gray-500">({images.length})</span>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {images.map((img) => (
          <img
            key={img.index}
            src={`${img.thumbUrl}?t=${Date.now()}`}
            alt={`${label} ${img.index}`}
            className="w-16 h-16 rounded border border-panel-border object-cover"
          />
        ))}
        <AdminImageUpload
          category="flagships"
          entityId={hullId}
          entityName={`Flagship ${label}`}
          onUploadComplete={loadImages}
        />
      </div>
      {!loading && images.length === 0 && (
        <p className="text-xs text-gray-500">Aucun visuel pour cette coque.</p>
      )}
    </div>
  );
}

export function FlagshipImagePool() {
  return (
    <div className="admin-card mb-6">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
        <Ship className="w-4 h-4 text-hull-400" />
        <span className="font-semibold text-gray-100">Visuels du Flagship</span>
      </div>
      <div className="p-4 space-y-4">
        {HULL_TYPES.map((hull) => (
          <FlagshipHullImages key={hull.id} hullId={hull.id} label={hull.label} color={hull.color} />
        ))}
      </div>
    </div>
  );
}
