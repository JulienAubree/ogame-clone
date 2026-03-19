export enum MissionType {
  Transport = 'transport',
  Station = 'station',
  Spy = 'spy',
  Attack = 'attack',
  Colonize = 'colonize',
  Recycle = 'recycle',
  Mine = 'mine',
  Pirate = 'pirate',
}

export enum FleetPhase {
  Outbound = 'outbound',
  Prospecting = 'prospecting',
  Mining = 'mining',
  Return = 'return',
}

export enum FleetStatus {
  Active = 'active',
  Completed = 'completed',
  Recalled = 'recalled',
}
