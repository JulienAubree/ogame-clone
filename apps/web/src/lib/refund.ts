/**
 * Compute the proportional refund for cancelling an active building/research/etc.
 * Refund is capped at `maxRatio` of the original cost (default 70%).
 */
export function estimateRefund(
  cost: { minerai: number; silicium: number; hydrogene: number },
  endTime: string,
  totalDurationSec: number,
  maxRatio = 0.7,
) {
  const totalMs = totalDurationSec * 1000;
  const timeLeft = Math.max(0, new Date(endTime).getTime() - Date.now());
  const ratio = Math.min(maxRatio, totalMs > 0 ? timeLeft / totalMs : 0);
  return {
    minerai: Math.floor(cost.minerai * ratio),
    silicium: Math.floor(cost.silicium * ratio),
    hydrogene: Math.floor(cost.hydrogene * ratio),
    ratio: Math.round(ratio * 100),
  };
}
