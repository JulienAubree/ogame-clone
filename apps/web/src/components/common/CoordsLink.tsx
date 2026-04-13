/**
 * CoordsLink — clickable galaxy coordinates that navigate to the
 * galaxy view with the system and optionally the position pre-selected.
 *
 * Renders as a monospace link: [1:42:5] or [1:42] (without position).
 */

import { Link } from 'react-router';

interface CoordsLinkProps {
  galaxy: number;
  system: number;
  position?: number | null;
  className?: string;
}

export function CoordsLink({ galaxy, system, position, className }: CoordsLinkProps) {
  const label = position != null
    ? `[${galaxy}:${system}:${position}]`
    : `[${galaxy}:${system}]`;

  const href = position != null
    ? `/galaxy?g=${galaxy}&s=${system}&pos=${position}`
    : `/galaxy?g=${galaxy}&s=${system}`;

  return (
    <Link
      to={href}
      className={className ?? 'text-cyan-400 hover:text-cyan-300 hover:underline font-mono text-xs transition-colors'}
      title={`Voir dans la galaxie ${label}`}
    >
      {label}
    </Link>
  );
}
