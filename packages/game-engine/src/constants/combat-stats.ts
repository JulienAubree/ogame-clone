export interface UnitCombatStats {
  weapons: number;
  shield: number;
  armor: number;
}

export const COMBAT_STATS: Record<string, UnitCombatStats> = {
  // Ships
  smallCargo:     { weapons: 5,    shield: 10,    armor: 4000 },
  largeCargo:     { weapons: 5,    shield: 25,    armor: 12000 },
  lightFighter:   { weapons: 50,   shield: 10,    armor: 4000 },
  heavyFighter:   { weapons: 150,  shield: 25,    armor: 10000 },
  cruiser:        { weapons: 400,  shield: 50,    armor: 27000 },
  battleship:     { weapons: 1000, shield: 200,   armor: 60000 },
  espionageProbe: { weapons: 0,    shield: 0,     armor: 1000 },
  colonyShip:     { weapons: 50,   shield: 100,   armor: 30000 },
  recycler:       { weapons: 1,    shield: 10,    armor: 16000 },
  prospector:     { weapons: 5,    shield: 10,    armor: 5000 },
  explorer:       { weapons: 20,   shield: 20,    armor: 8000 },
  // Defenses
  rocketLauncher: { weapons: 80,   shield: 20,    armor: 2000 },
  lightLaser:     { weapons: 100,  shield: 25,    armor: 2000 },
  heavyLaser:     { weapons: 250,  shield: 100,   armor: 8000 },
  gaussCannon:    { weapons: 1100, shield: 200,   armor: 35000 },
  plasmaTurret:   { weapons: 3000, shield: 300,   armor: 100000 },
  smallShield:    { weapons: 1,    shield: 2000,  armor: 2000 },
  largeShield:    { weapons: 1,    shield: 10000, armor: 10000 },
};

// rapidFire[attacker][target] = N → (N-1)/N chance to fire again
export const RAPID_FIRE: Record<string, Record<string, number>> = {
  smallCargo:   { espionageProbe: 5 },
  largeCargo:   { espionageProbe: 5 },
  lightFighter: { espionageProbe: 5 },
  heavyFighter: { espionageProbe: 5, smallCargo: 3 },
  cruiser:      { espionageProbe: 5, lightFighter: 6, smallCargo: 3, rocketLauncher: 10 },
  battleship:   { espionageProbe: 5, lightFighter: 4, smallCargo: 4, largeCargo: 4 },
  colonyShip:   { espionageProbe: 5 },
};
