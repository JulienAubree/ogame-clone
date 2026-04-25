export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h > 0 ? `${h}h` : '', m > 0 ? `${m}m` : '', `${s}s`].filter(Boolean).join(' ');
}

/**
 * Formate un nombre d'heures (potentiellement décimal) en libellé lisible.
 * `25.5h → "1j 1h"`, `2.5h → "2h 30min"`, `0.25h → "15min"`.
 */
export function formatHoursMinutes(hours: number): string {
  if (hours >= 24) return `${Math.floor(hours / 24)}j ${Math.floor(hours % 24)}h`;
  if (hours >= 1) return `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}min`;
  return `${Math.round(hours * 60)}min`;
}

export function formatNumber(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 10_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString('fr-FR');
}

export function timeAgo(date: string | Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `il y a ${days}j`;
}
