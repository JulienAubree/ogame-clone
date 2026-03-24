export interface AttackDetectionResult {
  /** Score = defenderSensorNetwork - attackerStealthTech */
  score: number;
  /** Tier index (0-based) into the thresholds */
  tier: number;
  /** % of travel time remaining when detection fires (e.g. 20 means detected with 20% left) */
  detectionPercent: number;
  /** What info the defender can see */
  visibility: AttackVisibility;
}

export interface AttackVisibility {
  /** Always true once detected */
  alert: boolean;
  /** Show origin coordinates */
  originCoords: boolean;
  /** Show total ship count */
  shipCount: boolean;
  /** Show exact ship composition */
  shipDetails: boolean;
  /** Show attacker username */
  attackerName: boolean;
}

/**
 * Calculate attack detection parameters.
 *
 * @param defenderSensorNetwork - Defender's sensor network tech level
 * @param attackerStealthTech - Attacker's stealth tech level
 * @param scoreThresholds - Score thresholds for each tier (from universe_config), e.g. [0, 1, 3, 5, 7]
 * @param timingPercents - Detection timing per tier (% of trip remaining), e.g. [20, 40, 60, 80, 100]
 */
export function calculateAttackDetection(
  defenderSensorNetwork: number,
  attackerStealthTech: number,
  scoreThresholds: number[],
  timingPercents: number[],
): AttackDetectionResult {
  const score = defenderSensorNetwork - attackerStealthTech;

  // Find the highest tier the score qualifies for
  let tier = 0;
  for (let i = scoreThresholds.length - 1; i >= 0; i--) {
    if (score >= scoreThresholds[i]) {
      tier = i;
      break;
    }
  }

  const detectionPercent = timingPercents[tier] ?? timingPercents[0] ?? 20;

  return {
    score,
    tier,
    detectionPercent,
    visibility: {
      alert: true,
      originCoords: tier >= 1,
      shipCount: tier >= 2,
      shipDetails: tier >= 3,
      attackerName: tier >= 4,
    },
  };
}

/**
 * Calculate the delay (in ms) before the detection job should fire.
 *
 * @param travelDurationMs - Total travel time in milliseconds
 * @param detectionPercent - % of travel remaining when detection fires
 * @returns Delay in ms from departure
 */
export function detectionDelay(travelDurationMs: number, detectionPercent: number): number {
  // Detection fires when (100 - detectionPercent)% of the trip has elapsed
  const delay = travelDurationMs * (1 - detectionPercent / 100);
  return Math.max(0, Math.floor(delay));
}
