import { getFlagshipImageUrl } from '@/lib/assets';

interface FlagshipImagePickerProps {
  open: boolean;
  hullId: string;
  currentImageIndex: number | null;
  images: number[];
  onSelect: (imageIndex: number) => void;
  onClose: () => void;
}

export function FlagshipImagePicker({
  open,
  hullId,
  currentImageIndex,
  images,
  onSelect,
  onClose,
}: FlagshipImagePickerProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card max-w-lg w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Choisir une image</h3>
        {images.length === 0 ? (
          <div className="text-muted-foreground text-sm">Aucune image disponible</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-80 overflow-y-auto">
            {images.map((idx) => (
              <button
                key={idx}
                onClick={() => onSelect(idx)}
                className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                  idx === currentImageIndex ? 'border-primary ring-2 ring-primary/50' : 'border-white/10 hover:border-white/30'
                }`}
              >
                <img src={getFlagshipImageUrl(hullId, idx, 'thumb')} alt={`Flagship ${idx}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Fermer</button>
        </div>
      </div>
    </div>
  );
}
