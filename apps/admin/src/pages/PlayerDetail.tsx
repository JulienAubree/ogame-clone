import { useParams, Link } from 'react-router';
import { trpc } from '@/trpc';
import { useGameConfig } from '@/hooks/useGameConfig';
import { PageSkeleton } from '@/components/ui/LoadingSpinner';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { ArrowLeft, Ship, Gem, Sparkles, Wrench, RotateCcw, Crown, Shield } from 'lucide-react';
import { useState } from 'react';

function CoordinateEditor({
  planetId,
  galaxy,
  system,
  position,
  onSaved,
}: {
  planetId: string;
  galaxy: number;
  system: number;
  position: number;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ galaxy, system, position });
  const mutation = trpc.playerAdmin.updatePlanetCoordinates.useMutation({ onSuccess: onSaved });

  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={form.galaxy}
        onChange={(e) => setForm({ ...form, galaxy: Number(e.target.value) })}
        className="admin-input w-16 py-1 text-xs font-mono"
        title="Galaxie"
        min={1}
      />
      <span className="text-gray-500">:</span>
      <input
        type="number"
        value={form.system}
        onChange={(e) => setForm({ ...form, system: Number(e.target.value) })}
        className="admin-input w-16 py-1 text-xs font-mono"
        title="Systeme"
        min={1}
      />
      <span className="text-gray-500">:</span>
      <input
        type="number"
        value={form.position}
        onChange={(e) => setForm({ ...form, position: Number(e.target.value) })}
        className="admin-input w-16 py-1 text-xs font-mono"
        title="Position"
        min={1}
      />
      <button
        onClick={() => mutation.mutate({ planetId, ...form })}
        disabled={mutation.isPending}
        className="admin-btn-primary py-1 px-3 text-xs"
      >
        {mutation.isPending ? '...' : 'Sauver'}
      </button>
    </div>
  );
}

function ResourceEditor({
  planetId,
  minerai,
  silicium,
  hydrogene,
  onSaved,
}: {
  planetId: string;
  minerai: string;
  silicium: string;
  hydrogene: string;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ minerai, silicium, hydrogene });
  const mutation = trpc.playerAdmin.updateResources.useMutation({ onSuccess: onSaved });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="text"
        value={form.minerai}
        onChange={(e) => setForm({ ...form, minerai: e.target.value })}
        className="admin-input w-24 sm:w-28 py-1 text-xs"
        title="Minerai"
      />
      <input
        type="text"
        value={form.silicium}
        onChange={(e) => setForm({ ...form, silicium: e.target.value })}
        className="admin-input w-24 sm:w-28 py-1 text-xs"
        title="Silicium"
      />
      <input
        type="text"
        value={form.hydrogene}
        onChange={(e) => setForm({ ...form, hydrogene: e.target.value })}
        className="admin-input w-24 sm:w-28 py-1 text-xs"
        title="Hydrogène"
      />
      <button
        onClick={() => mutation.mutate({ planetId, ...form })}
        disabled={mutation.isPending}
        className="admin-btn-primary py-1 px-3 text-xs"
      >
        {mutation.isPending ? '...' : 'Sauver'}
      </button>
    </div>
  );
}

// ── Ship & Defense editors ──

const SHIP_FIELDS = [
  { key: 'smallCargo', label: 'Petit cargo' },
  { key: 'largeCargo', label: 'Grand cargo' },
  { key: 'interceptor', label: 'Intercepteur' },
  { key: 'frigate', label: 'Fregate' },
  { key: 'cruiser', label: 'Croiseur' },
  { key: 'battlecruiser', label: 'Croiseur B.' },
  { key: 'espionageProbe', label: 'Sonde espion' },
  { key: 'colonyShip', label: 'Vaiss. colo.' },
  { key: 'recycler', label: 'Recycleur' },
  { key: 'prospector', label: 'Prospecteur' },
  { key: 'recuperateur', label: 'Recuperateur' },
  { key: 'solarSatellite', label: 'Sat. solaire' },
  { key: 'explorer', label: 'Explorateur' },
];

const DEFENSE_FIELDS = [
  { key: 'rocketLauncher', label: 'Lance-roquettes' },
  { key: 'lightLaser', label: 'Laser leger' },
  { key: 'heavyLaser', label: 'Laser lourd' },
  { key: 'electromagneticCannon', label: 'Canon EM' },
  { key: 'plasmaTurret', label: 'Tourelle plasma' },
];

function ShipEditor({
  planetId,
  ships,
  onSaved,
}: {
  planetId: string;
  ships: Record<string, number> | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    for (const { key } of SHIP_FIELDS) s[key] = ships?.[key] ?? 0;
    return s;
  });
  const mutation = trpc.playerAdmin.updatePlanetShips.useMutation({ onSuccess: onSaved });

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2">
        {SHIP_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-20 text-right shrink-0 truncate" title={label}>{label}</label>
            <input
              type="number"
              min={0}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              className="admin-input w-16 py-1 text-xs font-mono"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => mutation.mutate({ planetId, ships: form })}
        disabled={mutation.isPending}
        className="admin-btn-primary py-1 px-3 text-xs"
      >
        {mutation.isPending ? '...' : 'Sauver vaisseaux'}
      </button>
    </div>
  );
}

function DefenseEditor({
  planetId,
  defenses,
  onSaved,
}: {
  planetId: string;
  defenses: Record<string, number> | null;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    for (const { key } of DEFENSE_FIELDS) s[key] = defenses?.[key] ?? 0;
    return s;
  });
  const mutation = trpc.playerAdmin.updatePlanetDefenses.useMutation({ onSuccess: onSaved });

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-2">
        {DEFENSE_FIELDS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-24 text-right shrink-0 truncate" title={label}>{label}</label>
            <input
              type="number"
              min={0}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: Number(e.target.value) })}
              className="admin-input w-16 py-1 text-xs font-mono"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => mutation.mutate({ planetId, defenses: form })}
        disabled={mutation.isPending}
        className="admin-btn-primary py-1 px-3 text-xs"
      >
        {mutation.isPending ? '...' : 'Sauver defenses'}
      </button>
    </div>
  );
}

// ── Flagship stat editor ──

const FLAGSHIP_STATS = [
  { key: 'weapons', label: 'Armes' },
  { key: 'shield', label: 'Bouclier' },
  { key: 'hull', label: 'Coque' },
  { key: 'baseArmor', label: 'Armure' },
  { key: 'shotCount', label: 'Tirs' },
  { key: 'baseSpeed', label: 'Vitesse' },
  { key: 'fuelConsumption', label: 'Carburant' },
  { key: 'cargoCapacity', label: 'Cargo' },
];

function FlagshipSection({ flagship, userId, onSaved }: { flagship: any; userId: string; onSaved: () => void }) {
  const [stats, setStats] = useState<Record<string, number>>(() => {
    const s: Record<string, number> = {};
    for (const { key } of FLAGSHIP_STATS) s[key] = flagship[key] ?? 0;
    return s;
  });
  const [confirmRepair, setConfirmRepair] = useState(false);

  const updateMut = trpc.playerAdmin.updateFlagshipStats.useMutation({ onSuccess: onSaved });
  const repairMut = trpc.playerAdmin.repairFlagship.useMutation({
    onSuccess: () => { onSaved(); setConfirmRepair(false); },
  });

  const isIncapacitated = flagship.status === 'incapacitated';

  return (
    <div className="admin-card p-4 mb-8">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-200">{flagship.name}</span>
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
            isIncapacitated ? 'text-red-400 bg-red-900/20' :
            flagship.status === 'in_mission' ? 'text-blue-400 bg-blue-900/20' :
            'text-emerald-400 bg-emerald-900/20'
          }`}>
            {flagship.status}
          </span>
          <span className="text-xs text-gray-500 font-mono">propulsion: {flagship.driveType}</span>
        </div>
        <div className="flex gap-2">
          {isIncapacitated && (
            <button onClick={() => setConfirmRepair(true)} className="admin-btn-primary py-1 px-3 text-xs flex items-center gap-1">
              <Wrench className="w-3 h-3" /> Reparer
            </button>
          )}
        </div>
      </div>

      {isIncapacitated && flagship.repairEndsAt && (
        <div className="text-xs text-red-400/80 mb-3">
          Reparation prevue : {new Date(flagship.repairEndsAt).toLocaleString('fr-FR')}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {FLAGSHIP_STATS.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2">
            <label className="text-xs text-gray-400 w-16 text-right shrink-0">{label}</label>
            <input
              type="number"
              value={stats[key]}
              onChange={(e) => setStats({ ...stats, [key]: Number(e.target.value) })}
              className="admin-input w-20 py-1 text-xs font-mono"
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => updateMut.mutate({ userId, stats })}
        disabled={updateMut.isPending}
        className="admin-btn-primary py-1 px-3 text-xs"
      >
        {updateMut.isPending ? '...' : 'Sauver stats'}
      </button>

      <ConfirmDialog
        open={confirmRepair}
        title="Reparer le flagship ?"
        message="Le flagship sera remis en etat actif immediatement."
        confirmLabel="Reparer"
        onConfirm={() => repairMut.mutate({ userId })}
        onCancel={() => setConfirmRepair(false)}
      />
    </div>
  );
}

// ── Exilium editor ──

function ExiliumSection({ exilium, userId, onSaved }: { exilium: any; userId: string; onSaved: () => void }) {
  const [balance, setBalance] = useState(exilium?.balance ?? 0);
  const mutation = trpc.playerAdmin.setExiliumBalance.useMutation({ onSuccess: onSaved });

  return (
    <div className="admin-card p-4 mb-8">
      <div className="flex items-center gap-4">
        <div>
          <span className="text-xs text-gray-500">Solde</span>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              value={balance}
              onChange={(e) => setBalance(Number(e.target.value))}
              className="admin-input w-24 py-1 text-xs font-mono"
            />
            <button
              onClick={() => mutation.mutate({ userId, balance })}
              disabled={mutation.isPending}
              className="admin-btn-primary py-1 px-3 text-xs"
            >
              {mutation.isPending ? '...' : 'Sauver'}
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500">
          <div>Total gagne : <span className="text-emerald-400 font-mono">{exilium?.totalEarned ?? 0}</span></div>
          <div>Total depense : <span className="text-red-400 font-mono">{exilium?.totalSpent ?? 0}</span></div>
        </div>
      </div>
    </div>
  );
}

// ── Flagship Talents viewer ──

function TalentsSection({ talents, flagshipId, gameConfig, onSaved }: { talents: any[]; flagshipId: string; gameConfig: any; onSaved: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const resetMut = trpc.playerAdmin.resetFlagshipTalents.useMutation({
    onSuccess: () => { onSaved(); setConfirmReset(false); },
  });

  const talentDefs = gameConfig?.talents ?? {};
  const invested = talents.filter((t: any) => t.currentRank > 0);

  return (
    <div className="admin-card p-4 mb-8">
      {invested.length === 0 ? (
        <div className="text-sm text-gray-500">Aucun talent investi.</div>
      ) : (
        <div className="space-y-1 mb-3">
          {invested.map((t: any) => {
            const def = talentDefs[t.talentId];
            return (
              <div key={t.talentId} className="flex items-center justify-between bg-panel rounded px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-200">{def?.name ?? t.talentId}</span>
                  <span className="text-xs text-gray-500 font-mono">({t.talentId})</span>
                </div>
                <span className="font-mono text-sm text-purple-400">
                  {t.currentRank}/{def?.maxRanks ?? '?'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {invested.length > 0 && (
        <button
          onClick={() => setConfirmReset(true)}
          className="admin-btn-ghost text-xs text-red-400 flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Reinitialiser tous les talents
        </button>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reinitialiser les talents ?"
        message="Tous les talents du flagship seront remis a zero. L'Exilium ne sera pas rembourse."
        danger
        confirmLabel="Reinitialiser"
        onConfirm={() => resetMut.mutate({ flagshipId })}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

export default function PlayerDetail() {
  const { id } = useParams();
  const { data, isLoading, refetch } = trpc.playerAdmin.detail.useQuery(
    { userId: id! },
    { enabled: !!id },
  );
  const { data: gameConfig } = useGameConfig();
  const [capitalConfirm, setCapitalConfirm] = useState<{ planetId: string; name: string } | null>(null);
  const setCapitalMut = trpc.playerAdmin.setCapital.useMutation({
    onSuccess: () => { refetch(); setCapitalConfirm(null); },
  });

  if (isLoading) return <PageSkeleton />;
  if (!data) return <div className="text-gray-500">Joueur introuvable.</div>;

  return (
    <div className="animate-fade-in">
      <Link to="/players" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 mb-4">
        <ArrowLeft className="w-4 h-4" /> Retour
      </Link>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-6">
        <h1 className="text-lg font-semibold text-gray-100">{data.user.username}</h1>
        <span className="text-sm text-gray-500 break-all">{data.user.email}</span>
        {data.user.bannedAt && <span className="admin-badge-danger">Banni</span>}
      </div>

      {/* Planets */}
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">
        Planetes ({data.planets?.length ?? 0})
      </h2>

      <div className="space-y-4 mb-8">
        {data.planets?.map((planet: any) => (
          <div key={planet.id} className="admin-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-200">{planet.name}</span>
                {planet.planetClassId === 'homeworld' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded font-medium text-yellow-400 bg-yellow-900/20">Capitale</span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded font-medium text-gray-500 bg-panel">{planet.planetClassId ?? 'colonie'}</span>
                )}
              </div>
              {planet.planetClassId !== 'homeworld' && (
                <button
                  onClick={() => setCapitalConfirm({ planetId: planet.id, name: planet.name })}
                  className="admin-btn-ghost py-1 px-2 text-xs flex items-center gap-1 text-yellow-400"
                >
                  <Crown className="w-3 h-3" /> Definir comme capitale
                </button>
              )}
            </div>

            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">Coordonnees (Galaxie : Systeme : Position)</div>
              <CoordinateEditor
                planetId={planet.id}
                galaxy={planet.galaxy}
                system={planet.system}
                position={planet.position}
                onSaved={refetch}
              />
            </div>

            <div className="mb-3">
              <div className="text-xs text-gray-500 mb-1">Ressources (Minerai / Silicium / H₂)</div>
              <ResourceEditor
                planetId={planet.id}
                minerai={String(Math.floor(Number(planet.minerai ?? 0)))}
                silicium={String(Math.floor(Number(planet.silicium ?? 0)))}
                hydrogene={String(Math.floor(Number(planet.hydrogene ?? 0)))}
                onSaved={refetch}
              />
            </div>

            {/* Building levels */}
            <div className="text-xs text-gray-500 mb-1">Batiments</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-3">
              {Object.entries(planet)
                .filter(([key]) => key.endsWith('Level'))
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between bg-panel rounded px-2 py-1">
                    <span className="text-xs text-gray-400 truncate">{key.replace('Level', '')}</span>
                    <span className="font-mono text-xs text-gray-200 ml-1">{String(value)}</span>
                  </div>
                ))}
            </div>

            {/* Ships */}
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Ship className="w-3 h-3" /> Vaisseaux
            </div>
            <div className="mb-3">
              <ShipEditor planetId={planet.id} ships={planet.ships} onSaved={refetch} />
            </div>

            {/* Defenses */}
            <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3" /> Defenses
            </div>
            <DefenseEditor planetId={planet.id} defenses={planet.defenses} onSaved={refetch} />
          </div>
        ))}
      </div>

      {/* Research */}
      {data.research && (
        <>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3">Recherches</h2>
          <div className="admin-card p-4 mb-8">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {Object.entries(data.research)
                .filter(([key]) => key !== 'id' && key !== 'userId')
                .map(([key, value]) => (
                  <div key={key} className="flex items-center justify-between bg-panel rounded px-2 py-1">
                    <span className="text-xs text-gray-400">{key}</span>
                    <span className="font-mono text-xs text-gray-200">{String(value)}</span>
                  </div>
                ))}
            </div>
          </div>
        </>
      )}

      {/* Flagship */}
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Ship className="w-4 h-4" /> Vaisseau Amiral
      </h2>
      {data.flagship ? (
        <FlagshipSection flagship={data.flagship} userId={data.user.id} onSaved={refetch} />
      ) : (
        <div className="admin-card p-4 mb-8 text-sm text-gray-500">Aucun vaisseau amiral.</div>
      )}

      {/* Exilium */}
      <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
        <Gem className="w-4 h-4" /> Exilium
      </h2>
      <ExiliumSection exilium={data.exilium} userId={data.user.id} onSaved={refetch} />

      {/* Talents */}
      {data.flagship && (
        <>
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Talents Flagship
          </h2>
          <TalentsSection
            talents={data.flagshipTalents ?? []}
            flagshipId={data.flagship.id}
            gameConfig={gameConfig}
            onSaved={refetch}
          />
        </>
      )}

      <ConfirmDialog
        open={!!capitalConfirm}
        title="Changer la capitale ?"
        message={`"${capitalConfirm?.name}" deviendra la capitale. L'IPC sera supprime de l'ancienne capitale.`}
        confirmLabel={setCapitalMut.isPending ? '...' : 'Confirmer'}
        onConfirm={() => {
          if (capitalConfirm && id) {
            setCapitalMut.mutate({ userId: id, planetId: capitalConfirm.planetId });
          }
        }}
        onCancel={() => setCapitalConfirm(null)}
      />
    </div>
  );
}
