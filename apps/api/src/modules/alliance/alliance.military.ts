export type MilitaryOutcome = 'victory' | 'defeat' | 'draw';

export function bucketMilitaryOutcomes(rows: Array<{ outcome: MilitaryOutcome }>): { wins: number; losses: number } {
  let wins = 0;
  let losses = 0;
  for (const row of rows) {
    if (row.outcome === 'victory') wins += 1;
    else if (row.outcome === 'defeat') losses += 1;
  }
  return { wins, losses };
}
