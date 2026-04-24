import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type TraitVariant = 'rafale' | 'chainKill';

interface Props {
  variant: TraitVariant;
  label: string;
  categoryLabel?: string;
  count?: number;
}

const VARIANT_STYLES: Record<TraitVariant, { color: string; borderColor: string; bgColor: string }> = {
  rafale: {
    color: '#fcd34d',
    borderColor: 'rgba(251, 191, 36, 0.3)',
    bgColor: 'rgba(251, 191, 36, 0.15)',
  },
  chainKill: {
    color: '#c4b5fd',
    borderColor: 'rgba(168, 85, 247, 0.3)',
    bgColor: 'rgba(168, 85, 247, 0.15)',
  },
};

function getContent(variant: TraitVariant, categoryLabel?: string, count?: number): { title: string; description: string; example?: string } {
  if (variant === 'rafale') {
    return {
      title: `Rafale ${count} ${categoryLabel}`,
      description: `Cette batterie tire ${count} coups supplémentaires (en plus de ses tirs de base) quand la cible appartient à la catégorie ${categoryLabel}.`,
      example: `Si la batterie a 2 tirs de base et que la cible est ${categoryLabel}, elle en tire ${(count ?? 0) + 2}. Sinon, elle garde ses 2 tirs habituels.`,
    };
  }
  return {
    title: 'Enchaînement',
    description: "Quand un tir détruit sa cible, la batterie tire un coup bonus sur une autre unité de la même catégorie.",
    example: "Utile pour nettoyer les essaims d'unités fragiles. Limité à 1 bonus par tir de base.",
  };
}

export function CombatTraitPopover({ variant, label, categoryLabel, count }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const styles = VARIANT_STYLES[variant];
  const content = getContent(variant, categoryLabel, count);

  const handleEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = 240;
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - popoverWidth - 8);
      }
      setCoords({ top: rect.bottom + 6, left });
    }
    setIsOpen(true);
  };

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={() => { setIsOpen(false); setCoords(null); }}
        className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded border cursor-help transition-colors"
        style={{
          color: styles.color,
          borderColor: styles.borderColor,
          backgroundColor: isOpen ? styles.bgColor.replace('0.15', '0.25') : styles.bgColor,
        }}
      >
        {label}
      </span>
      {isOpen && coords && createPortal(
        <div
          className="fixed w-60 rounded-lg border border-border bg-popover p-3 shadow-xl pointer-events-none"
          style={{ top: coords.top, left: coords.left, zIndex: 9999 }}
        >
          <div className="mb-1.5">
            <span className="text-sm font-semibold" style={{ color: styles.color }}>
              {content.title}
            </span>
          </div>
          <p className="text-xs text-foreground leading-relaxed">{content.description}</p>
          {content.example && (
            <p className="mt-2 text-[11px] text-muted-foreground italic leading-relaxed">{content.example}</p>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
