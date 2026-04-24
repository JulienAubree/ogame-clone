import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { CombatReplay } from '@/components/combat-guide/CombatReplay';
import { computeUnitFP, type FPConfig, type UnitCombatStats } from '@exilium/game-engine';
import { useGameConfig } from '@/hooks/useGameConfig';
import { getShipName, getDefenseName } from '@/lib/entity-names';
import { CombatSimulator } from '@/components/combat-guide/CombatSimulator';

const TABS = [
  { id: 'beginner', label: 'Comprendre le combat' },
  { id: 'reference', label: 'Référence technique' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export default function CombatGuide() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.find((t) => t.id === searchParams.get('tab'))?.id ?? 'beginner';
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  const switchTab = (tab: TabId) => {
    setActiveTab(tab);
    setSearchParams(tab === 'beginner' ? {} : { tab });
  };

  return (
    <div className="space-y-4 p-4 lg:space-y-6 lg:p-6">
      <PageHeader title="Guide de combat spatial" />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchTab(tab.id)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'beginner' ? <BeginnerTab /> : <ReferenceTab />}
    </div>
  );
}

function BeginnerTab() {
  return (
    <div className="space-y-6">
      {/* Section 1: FP */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">C'est quoi le FP ?</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Le <span className="text-foreground font-semibold">Facteur de Puissance (FP)</span> est la note de puissance d'une flotte.
            Il combine la puissance de feu et la résistance de chaque vaisseau en un seul chiffre.
          </p>
          <p>
            Plus le FP est élevé, plus la flotte est redoutable.
            Par exemple, un <span className="text-foreground">intercepteur</span> vaut environ <span className="text-foreground">4 FP</span>,
            tandis qu'un <span className="text-foreground">cuirassé</span> en vaut <span className="text-foreground">98 FP</span>.
          </p>
          <p>
            Avant d'attaquer des pirates, comparez votre FP au leur — c'est le meilleur indicateur
            de vos chances de victoire.
          </p>
        </div>
      </section>

      {/* Section 2: Stats */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Les stats d'un vaisseau</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Chaque vaisseau a des batteries d'armes et 3 stats défensives :</p>
          <ul className="space-y-1.5 list-none">
            <li>
              <span className="text-foreground font-semibold">Batteries d'armes</span> — un vaisseau peut avoir une ou deux batteries.
              Chaque batterie a ses propres <span className="text-foreground">dégâts</span>, son <span className="text-foreground">nombre de tirs</span>, et sa <span className="text-foreground">catégorie cible</span> préférée (Léger, Moyen, Lourd).
              Le croiseur, par exemple, a un canon principal qui vise les vaisseaux lourds et des tourelles secondaires pour les légers.
            </li>
            <li>
              <span className="text-foreground font-semibold">Bouclier</span> — absorbe les dégâts en premier.
              Se <span className="text-foreground">régénère à 100%</span> à chaque round.
            </li>
            <li>
              <span className="text-foreground font-semibold">Armure</span> — réduction plate des dégâts.
              Quand un tir perce le bouclier, l'armure réduit les dégâts restants. Améliorée par la recherche Protection.
            </li>
            <li>
              <span className="text-foreground font-semibold">Coque</span> — les points de vie du vaisseau.
              Quand la coque tombe à 0, le vaisseau est <span className="text-red-400">détruit</span>. Pas de régénération.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 2bis: Traits de combat */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Traits de combat</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Certaines batteries ont des traits spéciaux qui modifient leur puissance :</p>
          <ul className="space-y-1.5 list-none">
            <li>
              <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-semibold mr-1.5">Rafale N Catégorie</span>
              Quand la cible appartient à la catégorie indiquée, la batterie tire <span className="text-foreground">N coups supplémentaires</span> (en plus de ses tirs de base).
              Exemple : le croiseur a <span className="text-foreground">Rafale 6 Léger</span> sur sa batterie secondaire → elle tire 8 coups au lieu de 2 contre les intercepteurs.
            </li>
            <li>
              <span className="inline-block px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 text-[10px] font-semibold mr-1.5">Enchaînement</span>
              Quand un tir détruit sa cible, la batterie tire <span className="text-foreground">un coup bonus</span> sur une autre unité de la même catégorie.
              Typique des unités légères (intercepteurs, lanceurs de missiles) qui excellent à nettoyer les essaims.
            </li>
          </ul>
          <p className="mt-2">
            <span className="text-foreground font-semibold">Qui bat qui ?</span> Les croiseurs dominent les intercepteurs (Rafale 6 Léger),
            les cuirassés excellent contre les frégates (Rafale 4 Moyen), mais un essaim d'intercepteurs peut submerger un cuirassé (pas de rafale contre les légers).
          </p>
        </div>
      </section>

      {/* Section 3: Combat flow */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Comment se déroule un combat</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Un combat se déroule en <span className="text-foreground font-semibold">4 rounds maximum</span>.
            Il s'arrête plus tôt si un camp est entièrement détruit.
          </p>
          <p>
            Les deux camps tirent <span className="text-foreground">simultanément</span> — même si un vaisseau est détruit dans le round,
            il a quand même le temps de tirer. C'est un échange de tirs, pas un tour par tour.
          </p>
        </div>
      </section>

      {/* Section 4: Round detail */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Un round en détail</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>Chaque round se déroule en 3 phases :</p>
          <ol className="list-decimal list-inside space-y-1.5">
            <li>
              <span className="text-foreground">Phase de tir attaquant</span> — chaque batterie de chaque attaquant sélectionne
              une cible dans sa catégorie préférée et tire son nombre de coups (augmenté si Rafale, +1 si Enchaînement sur destruction).
            </li>
            <li>
              <span className="text-foreground">Phase de tir défenseur</span> — même chose pour les défenseurs.
            </li>
            <li>
              <span className="text-foreground">Régénération des boucliers</span> — tous les survivants récupèrent
              100% de leur bouclier.
            </li>
          </ol>
          <p>
            Les dégâts infligés à la coque sont <span className="text-foreground">permanents</span>.
            Round après round, les vaisseaux s'affaiblissent jusqu'à la destruction.
          </p>
        </div>
      </section>

      {/* Section 5: Targeting */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Ciblage</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <p>
            Les vaisseaux ont un <span className="text-foreground">ordre de ciblage prioritaire</span> :
            d'abord les unités <span className="text-foreground">légères</span> (intercepteurs),
            puis les <span className="text-foreground">moyennes</span> (frégates),
            puis les <span className="text-foreground">lourdes</span> (croiseurs, cuirassés).
          </p>
          <p>
            Les vaisseaux de <span className="text-foreground">support</span> (cargos, recycleurs)
            ne sont ciblés <span className="text-foreground">qu'en dernier recours</span>, quand il ne reste plus de combattants.
          </p>
          <p>
            Au sein d'une catégorie, la cible est choisie au hasard.
          </p>
        </div>
      </section>

      {/* Section 6: After combat */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Après le combat</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <ul className="space-y-1.5 list-disc list-inside">
            <li>
              <span className="text-foreground">Débris</span> — 30% du coût des vaisseaux détruits
              (des deux camps) forment un champ de débris en minerai et silicium,
              récupérable par un recycleur. Les défenses ne génèrent pas de débris.
            </li>
            <li>
              <span className="text-foreground">Réparation des défenses</span> — chaque défense détruite
              a 70% de chance d'être automatiquement réparée après le combat.
              Les vaisseaux détruits sont perdus définitivement.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 7: Animated replay */}
      <section>
        <CombatReplay />
      </section>
    </div>
  );
}

function ReferenceTab() {
  const { data: gameConfig } = useGameConfig();

  if (!gameConfig) return null;

  const fpConfig: FPConfig = {
    shotcountExponent: Number(gameConfig.universe?.fp_shotcount_exponent ?? 1.5),
    divisor: Number(gameConfig.universe?.fp_divisor ?? 100),
  };

  const maxRounds = Number(gameConfig.universe?.combat_max_rounds ?? 4);
  const debrisRatio = Number(gameConfig.universe?.combat_debris_ratio ?? 0.3);
  const defenseRepairRate = Number(gameConfig.universe?.combat_defense_repair_rate ?? 0.7);
  const minDamage = Number(gameConfig.universe?.combat_min_damage_per_hit ?? 1);

  // Build ship rows sorted by FP desc
  const shipRows = Object.entries(gameConfig.ships)
    .filter(([, s]) => s.weapons > 0)
    .map(([id, s]) => {
      const stats: UnitCombatStats = { weapons: s.weapons, shotCount: s.shotCount, shield: s.shield, hull: s.hull };
      return { ...s, id, name: getShipName(id, gameConfig), fp: computeUnitFP(stats, fpConfig), category: s.combatCategoryId ?? '—' };
    })
    .sort((a, b) => b.fp - a.fp);

  // Build defense rows sorted by FP desc
  const defenseRows = Object.entries(gameConfig.defenses)
    .filter(([, d]) => d.weapons > 0)
    .map(([id, d]) => {
      const stats: UnitCombatStats = { weapons: d.weapons, shotCount: d.shotCount, shield: d.shield, hull: d.hull };
      return { ...d, id, name: getDefenseName(id, gameConfig), fp: computeUnitFP(stats, fpConfig), category: d.combatCategoryId ?? '—' };
    })
    .sort((a, b) => b.fp - a.fp);

  return (
    <div className="space-y-6">
      {/* Formule FP */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Formule du Facteur de Puissance</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <code className="block rounded bg-muted/50 p-3 text-foreground">
            FP = Math.round((armes × shotCount<sup>{fpConfig.shotcountExponent}</sup>) × (bouclier + coque) / {fpConfig.divisor})
          </code>
          <p>
            FP d'une flotte = somme de (FP unitaire × quantité) pour chaque type de vaisseau.
          </p>
          <div className="flex gap-4">
            <div>
              <span className="text-muted-foreground">Exposant shotCount :</span>{' '}
              <span className="text-foreground font-mono">{fpConfig.shotcountExponent}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Diviseur :</span>{' '}
              <span className="text-foreground font-mono">{fpConfig.divisor}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Formules de combat */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Formules de combat</h3>
        <div className="text-xs text-muted-foreground space-y-3">
          <div>
            <p className="font-medium text-foreground mb-1">Stats effectives (avec recherche)</p>
            <code className="block rounded bg-muted/50 p-2 text-foreground">
              armes_eff = armes_base × multiplicateur_armes<br />
              bouclier_eff = bouclier_base × multiplicateur_bouclier<br />
              coque_eff = coque_base × multiplicateur_blindage<br />
              armure_eff = armure_base × multiplicateur_blindage
            </code>
            <p className="mt-1">La recherche <span className="text-foreground">Technologie Protection</span> augmente la coque <span className="text-foreground">et</span> l'armure.</p>
          </div>

          <div>
            <p className="font-medium text-foreground mb-1">Dégâts par tir</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Si <code className="text-foreground">bouclier ≥ dégâts</code> → le bouclier absorbe tout, 0 dégâts à la coque.</li>
              <li>Sinon, <code className="text-foreground">surplus = dégâts − bouclier</code></li>
              <li>Dégâts coque = <code className="text-foreground">max(surplus − armure, {minDamage})</code> — minimum {minDamage} dégât garanti si le bouclier est percé.</li>
              <li>Destruction si <code className="text-foreground">coque ≤ 0</code>.</li>
            </ol>
          </div>

          <div>
            <p className="font-medium text-foreground mb-1">Paramètres de combat</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              <span>Rounds maximum :</span><span className="text-foreground font-mono">{maxRounds}</span>
              <span>Ratio débris :</span><span className="text-foreground font-mono">{(debrisRatio * 100).toFixed(0)}%</span>
              <span>Réparation défenses :</span><span className="text-foreground font-mono">{(defenseRepairRate * 100).toFixed(0)}%</span>
              <span>Dégât minimum :</span><span className="text-foreground font-mono">{minDamage}</span>
            </div>
          </div>
        </div>
      </section>

      {/* Targeting */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Priorité de ciblage</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="py-1 pr-4 text-foreground">Catégorie</th>
                  <th className="py-1 pr-4 text-foreground">Ordre</th>
                  <th className="py-1 text-foreground">Ciblable</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Léger</td><td className="py-1 pr-4">1 (priorité)</td><td className="py-1">Oui</td></tr>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Moyen</td><td className="py-1 pr-4">2</td><td className="py-1">Oui</td></tr>
                <tr className="border-b border-border/50"><td className="py-1 pr-4">Lourd</td><td className="py-1 pr-4">3</td><td className="py-1">Oui</td></tr>
                <tr><td className="py-1 pr-4">Support</td><td className="py-1 pr-4">4 (dernier)</td><td className="py-1">Non (dernier recours)</td></tr>
              </tbody>
            </table>
          </div>
          <p>
            L'algorithme cible d'abord la catégorie prioritaire, puis les catégories ciblables par ordre croissant.
            Les unités de support ne sont ciblées que s'il n'y a plus de combattants.
          </p>
        </div>
      </section>

      {/* Ship table */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Table des vaisseaux</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-3">Vaisseau</th>
                <th className="py-1.5 pr-3 text-right">Armes</th>
                <th className="py-1.5 pr-3 text-right">Tirs</th>
                <th className="py-1.5 pr-3 text-right">Bouclier</th>
                <th className="py-1.5 pr-3 text-right">Armure</th>
                <th className="py-1.5 pr-3 text-right">Coque</th>
                <th className="py-1.5 pr-3">Cat.</th>
                <th className="py-1.5 text-right font-semibold text-foreground">FP</th>
              </tr>
            </thead>
            <tbody>
              {shipRows.map((row) => (
                <tr key={row.id} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right">{row.weapons}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shotCount}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shield}</td>
                  <td className="py-1.5 pr-3 text-right">{row.baseArmor}</td>
                  <td className="py-1.5 pr-3 text-right">{row.hull}</td>
                  <td className="py-1.5 pr-3">{row.category}</td>
                  <td className="py-1.5 text-right font-bold text-foreground">{row.fp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Defense table */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Table des défenses</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1.5 pr-3">Défense</th>
                <th className="py-1.5 pr-3 text-right">Armes</th>
                <th className="py-1.5 pr-3 text-right">Tirs</th>
                <th className="py-1.5 pr-3 text-right">Bouclier</th>
                <th className="py-1.5 pr-3 text-right">Armure</th>
                <th className="py-1.5 pr-3 text-right">Coque</th>
                <th className="py-1.5 pr-3">Cat.</th>
                <th className="py-1.5 text-right font-semibold text-foreground">FP</th>
              </tr>
            </thead>
            <tbody>
              {defenseRows.map((row) => (
                <tr key={row.id} className="border-b border-border/30">
                  <td className="py-1.5 pr-3 text-foreground">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right">{row.weapons}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shotCount}</td>
                  <td className="py-1.5 pr-3 text-right">{row.shield}</td>
                  <td className="py-1.5 pr-3 text-right">{row.baseArmor}</td>
                  <td className="py-1.5 pr-3 text-right">{row.hull}</td>
                  <td className="py-1.5 pr-3">{row.category}</td>
                  <td className="py-1.5 text-right font-bold text-foreground">{row.fp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Debris & repair */}
      <section className="glass-card p-4 space-y-2">
        <h3 className="text-sm font-semibold text-primary">Débris et réparation</h3>
        <div className="text-xs text-muted-foreground space-y-2">
          <div>
            <p className="font-medium text-foreground mb-1">Champ de débris</p>
            <code className="block rounded bg-muted/50 p-2 text-foreground">
              débris_minerai = floor(coût_minerai_total × {debrisRatio})<br />
              débris_silicium = floor(coût_silicium_total × {debrisRatio})
            </code>
            <p className="mt-1">
              Seuls les <span className="text-foreground">vaisseaux détruits</span> (des deux camps) génèrent des débris.
              Les défenses ne contribuent pas au champ de débris.
            </p>
          </div>
          <div>
            <p className="font-medium text-foreground mb-1">Réparation des défenses</p>
            <p>
              Chaque défense détruite a <span className="text-foreground">{(defenseRepairRate * 100).toFixed(0)}%</span> de
              chance d'être automatiquement restaurée après le combat. Les vaisseaux ne sont jamais réparés.
            </p>
          </div>
        </div>
      </section>

      {/* Simulator */}
      <section>
        <CombatSimulator />
      </section>
    </div>
  );
}
