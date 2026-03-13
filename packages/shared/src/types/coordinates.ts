export interface Coordinates {
  galaxy: number;
  system: number;
  position: number;
}

export function formatCoordinates(coords: Coordinates): string {
  return `[${coords.galaxy}:${coords.system}:${coords.position}]`;
}
