import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';
import { CombatReplay } from '@/components/combat-guide/CombatReplay';

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
          <p>Chaque vaisseau a 5 statistiques de combat :</p>
          <ul className="space-y-1.5 list-none">
            <li>
              <span className="text-foreground font-semibold">Armes</span> — les dégâts infligés par tir.
              Un croiseur (45) frappe bien plus fort qu'un intercepteur (4).
            </li>
            <li>
              <span className="text-foreground font-semibold">Nombre de tirs (ShotCount)</span> — combien de fois le vaisseau tire par round.
              L'intercepteur tire <span className="text-foreground">3 fois</span> par round, le croiseur seulement <span className="text-foreground">1 fois</span>.
            </li>
            <li>
              <span className="text-foreground font-semibold">Bouclier</span> — absorbe les dégâts en premier.
              Se <span className="text-foreground">régénère à 100%</span> à chaque round.
            </li>
            <li>
              <span className="text-foreground font-semibold">Armure</span> — réduction fixe de dégâts.
              Quand un tir perce le bouclier, l'armure réduit les dégâts restants. Permanente.
            </li>
            <li>
              <span className="text-foreground font-semibold">Coque</span> — les points de vie du vaisseau.
              Quand la coque tombe à 0, le vaisseau est <span className="text-red-400">détruit</span>. Pas de régénération.
            </li>
          </ul>
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
              <span className="text-foreground">Phase de tir attaquant</span> — chaque vaisseau attaquant tire
              (nombre de tirs = son ShotCount) sur une cible aléatoire parmi les défenseurs.
            </li>
            <li>
              <span className="text-foreground">Phase de tir défenseur</span> — chaque défenseur tire de la même façon
              sur les attaquants.
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
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">Référence technique — à venir.</p>
    </div>
  );
}
