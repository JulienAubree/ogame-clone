import { useState } from 'react';
import { Key, Search, Zap, Shield, Rocket, FlaskConical, Factory, Coins, Globe } from 'lucide-react';

// ── Complete registry of all gameplay keys ──

interface GameplayKey {
  key: string;
  label: string;
  description: string;
  category: string;
  source: string;
  consumer: string;
  formula: string;
  example?: string;
}

const CATEGORIES = [
  { id: 'hull_passive', label: 'Bonus passifs de coque', icon: Shield, color: 'text-cyan-400' },
  { id: 'hull_time', label: 'Reductions de temps (coque)', icon: Zap, color: 'text-cyan-400' },
  { id: 'talent_stat', label: 'Stats flagship (talents)', icon: Rocket, color: 'text-red-400' },
  { id: 'talent_global', label: 'Bonus globaux (talents)', icon: Globe, color: 'text-emerald-400' },
  { id: 'talent_planet', label: 'Bonus planetaires (talents)', icon: Factory, color: 'text-amber-400' },
  { id: 'talent_buff', label: 'Buffs temporaires (talents)', icon: Zap, color: 'text-purple-400' },
  { id: 'talent_unlock', label: 'Deblocages (talents)', icon: Key, color: 'text-blue-400' },
  { id: 'building_bonus', label: 'Bonus batiments (resolveBonus)', icon: Factory, color: 'text-orange-400' },
  { id: 'research_bonus', label: 'Bonus recherches (resolveBonus)', icon: FlaskConical, color: 'text-green-400' },
  { id: 'economy', label: 'Economie & marche', icon: Coins, color: 'text-yellow-400' },
];

const KEYS: GameplayKey[] = [
  // ── Hull passive (stat bonuses) ──
  { key: 'bonus_weapons', label: 'Armes', description: '+N armes du flagship quand stationne', category: 'hull_passive', source: 'Hull config passiveBonuses', consumer: 'flagship.service.ts get()', formula: 'effectiveWeapons = base + talent + bonus_weapons', example: 'bonus_weapons: 8 → +8 armes' },
  { key: 'bonus_armor', label: 'Blindage', description: '+N blindage du flagship quand stationne', category: 'hull_passive', source: 'Hull config passiveBonuses', consumer: 'flagship.service.ts get()', formula: 'effectiveArmor = base + talent + bonus_armor', example: 'bonus_armor: 6 → +6 blindage' },
  { key: 'bonus_shot_count', label: 'Attaques', description: '+N attaques du flagship quand stationne', category: 'hull_passive', source: 'Hull config passiveBonuses', consumer: 'flagship.service.ts get()', formula: 'effectiveShots = base + talent + bonus_shot_count', example: 'bonus_shot_count: 2 → +2 tirs/round' },

  // ── Hull time reductions ──
  { key: 'combat_build_time_reduction', label: 'Construction militaire', description: 'Reduit le temps de construction des vaisseaux du Centre de commandement', category: 'hull_time', source: 'Hull config passiveBonuses', consumer: 'shipyard.service.ts (4 endroits)', formula: 'time = baseTime × talentMult × (1 - reduction)', example: '0.20 → -20% temps' },
  { key: 'industrial_build_time_reduction', label: 'Construction industrielle', description: 'Reduit le temps de construction des vaisseaux du Chantier spatial', category: 'hull_time', source: 'Hull config passiveBonuses', consumer: 'shipyard.service.ts (4 endroits)', formula: 'time = baseTime × talentMult × (1 - reduction)', example: '0.20 → -20% temps' },
  { key: 'research_time_reduction', label: 'Recherche', description: 'Reduit le temps de recherche sur la planete du flagship', category: 'hull_time', source: 'Hull config passiveBonuses', consumer: 'research.service.ts (2 endroits)', formula: 'time = baseTime × talentMult × (1 - reduction)', example: '0.20 → -20% temps' },

  // ── Talent modify_stat keys ──
  { key: 'weapons', label: 'Armes (talent)', description: '+N armes flagship par rang de talent', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts getStatBonuses()', formula: 'bonus = perRank × rank', example: 'combat_weapons: +2/rang × 3 = +6' },
  { key: 'shield', label: 'Bouclier (talent)', description: '+N bouclier flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts getStatBonuses()', formula: 'bonus = perRank × rank', example: 'combat_shield: +3/rang × 3 = +9' },
  { key: 'hull', label: 'Coque (talent)', description: '+N coque flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts getStatBonuses()', formula: 'bonus = perRank × rank', example: 'combat_hull: +5/rang × 3 = +15' },
  { key: 'baseArmor', label: 'Blindage (talent)', description: '+N blindage flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts getStatBonuses()', formula: 'bonus = perRank × rank', example: 'combat_armor: +2/rang × 3 = +6' },
  { key: 'shotCount', label: 'Tirs (talent)', description: '+N tirs/round flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts getStatBonuses()', formula: 'bonus = perRank × rank', example: 'combat_shots: +1/rang × 2 = +2' },
  { key: 'speedPercent', label: 'Vitesse (talent)', description: '+N% vitesse flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts get()', formula: 'speed = base × (1 + speedPercent)', example: 'explore_speed: +10%/rang × 3 = +30%' },
  { key: 'fuelConsumption', label: 'Carburant (talent)', description: '-N carburant flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts get()', formula: 'fuel = max(0, base + fuelConsumption)', example: 'explore_fuel: -1/rang × 3 = -3' },
  { key: 'cargoCapacity', label: 'Soute (talent)', description: '+N soute flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'flagship.service.ts get()', formula: 'cargo = base + cargoCapacity', example: 'trade_cargo: +100/rang × 3 = +300' },
  { key: 'damageMultiplier', label: 'Degats (talent)', description: '×N degats flagship par rang', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'combat engine', formula: 'damage = base × damageMultiplier', example: 'combat_fury: ×1.25/rang' },
  { key: 'combatBonusPerShipType', label: 'Bonus par type', description: '+N% stats combat par type de vaisseau dans la flotte', category: 'talent_stat', source: 'Talent effectParams.stat', consumer: 'combat engine', formula: '+10% par type unique', example: 'combat_supremacy: +10%' },

  // ── Talent global bonus keys ──
  { key: 'military_build_time', label: 'Temps construction militaire (talent)', description: 'Reduit le temps de construction des vaisseaux du Centre de commandement', category: 'talent_global', source: 'Talent global_bonus', consumer: 'shipyard.service.ts (4 endroits)', formula: 'time = base × (1 - bonus)', example: 'mil_build_time: 0.20 → -20%' },
  { key: 'industrial_build_time', label: 'Temps construction industrielle (talent)', description: 'Reduit le temps de construction des vaisseaux du Chantier spatial', category: 'talent_global', source: 'Talent global_bonus', consumer: 'shipyard.service.ts (4 endroits)', formula: 'time = base × (1 - bonus)', example: 'Futur talent industriel' },
  { key: 'military_parallel_build', label: 'Construction parallele', description: '+1 file de construction militaire', category: 'talent_global', source: 'Talent global_bonus', consumer: 'NON IMPLEMENTE', formula: 'slots = 1 + bonus', example: 'Pas encore consomme' },
  { key: 'ship_build_time', label: 'Temps construction', description: '-N% temps de construction vaisseaux (global)', category: 'talent_global', source: 'Talent global_bonus', consumer: 'shipyard.service.ts', formula: 'time = base × 1/(1+bonus)', example: 'combat_master: -15%' },
  { key: 'spy_probe_bonus', label: 'Sondes bonus', description: '+N sondes d\'espionnage envoyees', category: 'talent_global', source: 'Talent global_bonus', consumer: 'fleet.service.ts spy', formula: 'probes = base + bonus', example: 'explore_scanners: +1/rang' },
  { key: 'fleet_speed', label: 'Vitesse flottes', description: 'Modifie la vitesse des flottes', category: 'talent_global', source: 'Talent global_bonus', consumer: 'fleet.service.ts', formula: 'speed = base × (1 + bonus)', example: 'explore_navigation: -5%/rang' },
  { key: 'fleet_slot_global', label: 'Slots flotte (global)', description: '+N slots de flotte globaux', category: 'talent_global', source: 'Talent global_bonus', consumer: 'fleet.service.ts', formula: 'slots = base + bonus', example: 'explore_scout: +1' },
  { key: 'expedition_success_bonus', label: 'Expeditions', description: '+N% chance de succes des expeditions', category: 'talent_global', source: 'Talent global_bonus', consumer: 'pve.service.ts', formula: 'chance = base × (1 + bonus)', example: 'explore_cartographer: +10%/rang' },
  { key: 'market_fee_reduction', label: 'Frais marche', description: 'Reduit les frais du marche', category: 'economy', source: 'Talent global_bonus', consumer: 'market.service.ts', formula: 'fee = base × 1/(1+bonus)', example: 'trade_negotiator: -5%/rang' },
  { key: 'market_offer_slots', label: 'Offres marche', description: '+N emplacements d\'offres sur le marche', category: 'economy', source: 'Talent global_bonus', consumer: 'market.service.ts', formula: 'slots = base + bonus', example: 'trade_network: +1' },
  { key: 'pillage_protection', label: 'Protection pillage', description: 'N% de la soute protege du pillage', category: 'talent_global', source: 'Talent global_bonus', consumer: 'combat engine', formula: 'protected = cargo × bonus', example: 'trade_smuggler: 30%' },
  { key: 'fleet_cargo', label: 'Soute flottes', description: '+N% soute de toutes les flottes', category: 'talent_global', source: 'Talent global_bonus', consumer: 'fleet.service.ts', formula: 'cargo = base × (1 + bonus)', example: 'trade_hangars: +10%/rang' },
  { key: 'global_production_bonus', label: 'Production globale', description: '+N% production ressources toutes planetes', category: 'talent_global', source: 'Talent global_bonus', consumer: 'resource.service.ts', formula: 'production = base × (1 + bonus)', example: 'trade_empire: +5%' },

  // ── Talent planet bonus keys ──
  { key: 'defense_strength', label: 'Defense planetaire', description: '+N% puissance des defenses sur la planete', category: 'talent_planet', source: 'Talent planet_bonus', consumer: 'combat engine', formula: 'defense = base × (1 + bonus)', example: 'combat_garrison: +10%/rang' },
  { key: 'fleet_slot_bonus', label: 'Slot flotte (planete)', description: '+N slot de flotte sur cette planete', category: 'talent_planet', source: 'Talent planet_bonus', consumer: 'fleet.service.ts', formula: 'slots = base + bonus', example: 'explore_control: +1' },
  { key: 'storage_capacity_bonus', label: 'Stockage', description: '+N% capacite de stockage sur la planete', category: 'talent_planet', source: 'Talent planet_bonus', consumer: 'resource.service.ts', formula: 'storage = base × (1 + bonus)', example: 'trade_logistics: +5%/rang' },
  { key: 'mine_production_bonus', label: 'Production mines', description: '+N% production des mines sur la planete', category: 'talent_planet', source: 'Talent planet_bonus', consumer: 'resource.service.ts', formula: 'production = base × (1 + bonus)', example: 'trade_prospector: +3%/rang' },

  // ── Timed buff keys ──
  { key: 'fleet_damage_boost', label: 'Boost degats', description: '+25% degats des flottes depuis cette planete', category: 'talent_buff', source: 'Talent timed_buff', consumer: 'combat engine', formula: 'damage = base × (1 + multiplier)', example: 'combat_assault: 1h actif, 24h CD' },
  { key: 'reveal_incoming_fleets', label: 'Alerte flotte', description: 'Revele les flottes ennemies entrantes', category: 'talent_buff', source: 'Talent timed_buff', consumer: 'fleet.service.ts detection', formula: 'active pendant duree', example: 'explore_hyperscan: 4h actif, 12h CD' },
  { key: 'instant_fleet_recall', label: 'Rappel instantane', description: 'Rappel immediat d\'une flotte', category: 'talent_buff', source: 'Talent timed_buff', consumer: 'fleet.service.ts recall', formula: 'active pendant duree', example: 'explore_emergency: 1s actif, 24h CD' },
  { key: 'mine_overclock', label: 'Surcharge mines', description: '+50% production miniere temporaire', category: 'talent_buff', source: 'Talent timed_buff', consumer: 'resource.service.ts', formula: 'production = base × (1 + multiplier)', example: 'trade_overclock: 2h actif, 24h CD' },
  { key: 'resource_production_boost', label: 'Boost production', description: '+25% production ressources temporaire', category: 'talent_buff', source: 'Talent timed_buff', consumer: 'resource.service.ts', formula: 'production = base × (1 + multiplier)', example: 'trade_boom: 4h actif, 48h CD' },

  // ── Unlock keys ──
  { key: 'drive_impulse', label: 'Propulsion Impulsion', description: 'Debloque la propulsion par impulsion', category: 'talent_unlock', source: 'Talent unlock', consumer: 'flagship.service.ts get()', formula: 'driveType = "impulsion"', example: 'explore_impulse' },
  { key: 'drive_hyperspace', label: 'Propulsion Hyperespace', description: 'Debloque la propulsion hyperespace', category: 'talent_unlock', source: 'Talent unlock', consumer: 'flagship.service.ts get()', formula: 'driveType = "hyperespace"', example: 'explore_hyperdrive' },

  // ── resolveBonus (building/research) ──
  { key: 'research_time', label: 'Temps recherche (bat.)', description: 'Reduction du temps de recherche par niveau de batiment', category: 'building_bonus', source: 'Building bonus config', consumer: 'research.service.ts', formula: 'time = base × resolveBonus()', example: 'Labo: -15%/niveau' },
  { key: 'ship_build_time', label: 'Temps vaisseaux (bat.)', description: 'Reduction du temps de construction par batiment', category: 'building_bonus', source: 'Building bonus config', consumer: 'shipyard.service.ts', formula: 'time = base × resolveBonus()', example: 'Chantier/CC: -15%/niveau' },
  { key: 'defense_build_time', label: 'Temps defenses (bat.)', description: 'Reduction du temps de construction defenses', category: 'building_bonus', source: 'Building bonus config', consumer: 'shipyard.service.ts', formula: 'time = base × resolveBonus()', example: 'Arsenal: -15%/niveau' },
  { key: 'building_time', label: 'Temps batiments', description: 'Reduction du temps de construction batiments', category: 'building_bonus', source: 'Building bonus config', consumer: 'building.service.ts', formula: 'time = base × resolveBonus()', example: 'Nanites: -X%/niveau' },
  { key: 'weapons (research)', label: 'Armes (recherche)', description: 'Bonus d\'armes par niveau de recherche', category: 'research_bonus', source: 'Research bonus config', consumer: 'combat + ship details', formula: 'weapons = base × resolveBonus()', example: 'Tech armes: +X%/niveau' },
  { key: 'shielding', label: 'Bouclier (recherche)', description: 'Bonus bouclier par niveau de recherche', category: 'research_bonus', source: 'Research bonus config', consumer: 'combat + ship details', formula: 'shield = base × resolveBonus()', example: 'Tech bouclier: +X%/niveau' },
  { key: 'armor', label: 'Blindage (recherche)', description: 'Bonus blindage par niveau de recherche', category: 'research_bonus', source: 'Research bonus config', consumer: 'combat + ship details', formula: 'hull = base × resolveBonus()', example: 'Tech blindage: +X%/niveau' },
  { key: 'ship_speed', label: 'Vitesse (recherche)', description: 'Bonus vitesse par type de propulsion', category: 'research_bonus', source: 'Research bonus config', consumer: 'fleet speed calc', formula: 'speed = base × resolveBonus(driveType)', example: 'Combustion/Impulsion/Hyper' },
  { key: 'mining_extraction', label: 'Extraction miniere', description: 'Bonus extraction miniere', category: 'research_bonus', source: 'Research bonus config', consumer: 'mine.handler.ts', formula: 'extraction = base × resolveBonus()', example: 'Tech fracturation: +X%' },
];

export default function GameplayKeys() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const q = search.toLowerCase().trim();
  const filtered = KEYS.filter(k => {
    if (activeCategory && k.category !== activeCategory) return false;
    if (!q) return true;
    return k.key.toLowerCase().includes(q) || k.label.toLowerCase().includes(q) || k.description.toLowerCase().includes(q);
  });

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    keys: filtered.filter(k => k.category === cat.id),
  })).filter(g => g.keys.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Key className="w-5 h-5 text-cyan-400" />
          <h1 className="text-lg font-semibold text-gray-100">Cles de gameplay</h1>
          <span className="text-xs text-gray-500">{KEYS.length} cles</span>
        </div>
      </div>

      <p className="text-sm text-gray-400 mb-4">
        Reference de toutes les cles utilisees dans le moteur de jeu. Ces cles sont lues par le code backend pour appliquer les bonus, reductions et effets.
        Pour qu'une nouvelle cle fonctionne, elle doit etre lue quelque part dans le code.
      </p>

      {/* Search + filter */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Rechercher une cle..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="admin-input pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
              !activeCategory ? 'bg-cyan-900/40 border-cyan-700/50 text-cyan-400' : 'bg-gray-800/40 border-gray-700/50 text-gray-500 hover:text-gray-300'
            }`}
          >
            Toutes ({KEYS.length})
          </button>
          {CATEGORIES.map(cat => {
            const count = KEYS.filter(k => k.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
                className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                  activeCategory === cat.id ? 'bg-cyan-900/40 border-cyan-700/50 text-cyan-400' : 'bg-gray-800/40 border-gray-700/50 text-gray-500 hover:text-gray-300'
                }`}
              >
                {cat.label} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {grouped.map(group => (
        <div key={group.id} className="admin-card mb-4">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-panel-border">
            <group.icon className={`w-4 h-4 ${group.color}`} />
            <span className="font-semibold text-gray-100">{group.label}</span>
            <span className="text-xs text-gray-500">{group.keys.length}</span>
          </div>
          <div className="divide-y divide-panel-border">
            {group.keys.map(k => (
              <div key={k.key} className="px-4 py-3 hover:bg-gray-800/30 transition-colors">
                <div className="flex items-center gap-3 mb-1">
                  <code className="text-[11px] font-mono text-cyan-400 bg-cyan-900/20 px-1.5 py-0.5 rounded border border-cyan-800/20">{k.key}</code>
                  <span className="text-sm font-medium text-gray-200">{k.label}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">{k.description}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-500">
                  <span>Source : <span className="text-gray-400">{k.source}</span></span>
                  <span>Lu par : <span className="text-gray-400">{k.consumer}</span></span>
                  <span>Formule : <span className="text-gray-400 font-mono">{k.formula}</span></span>
                  {k.example && <span>Exemple : <span className="text-gray-400">{k.example}</span></span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <div className="admin-card p-8 text-center text-gray-500">Aucune cle trouvee.</div>
      )}
    </div>
  );
}
