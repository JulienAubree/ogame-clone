/**
 * Maximum number of simultaneous market offers for a given market building level.
 */
export function maxMarketOffers(marketLevel: number): number {
  return marketLevel * 2;
}

/**
 * Calculate commission amounts per resource component.
 * Commission is paid by the buyer on top of the price.
 * Each component is rounded up (ceil) to avoid fractional exploits.
 */
export function calculateCommission(
  price: { minerai: number; silicium: number; hydrogene: number },
  commissionPercent: number,
): { minerai: number; silicium: number; hydrogene: number } {
  return {
    minerai: price.minerai > 0 ? Math.ceil((price.minerai * commissionPercent) / 100) : 0,
    silicium: price.silicium > 0 ? Math.ceil((price.silicium * commissionPercent) / 100) : 0,
    hydrogene: price.hydrogene > 0 ? Math.ceil((price.hydrogene * commissionPercent) / 100) : 0,
  };
}

