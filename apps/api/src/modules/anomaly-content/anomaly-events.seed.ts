import type { AnomalyEventEntryInput } from './anomaly-content.types.js';

/**
 * Seed pool of 30 narrative events shipped with the V3 of the Anomaly mode.
 * Edited via the admin UI — the seed is the source of truth on first deploy
 * and after a reset. Each event has 2-3 choices with ponctual outcomes.
 *
 * Distribution: 10 early (depths 1-7), 10 mid (8-14), 10 deep (15-20).
 *
 * Conventions:
 *   - id: kebab-case, stable across versions
 *   - image: '' — admin uploads via /admin/anomalies
 *   - hidden: true → outcome shown only after click (narrative tension)
 *   - shipsGain/shipsLoss: combat ship ids only (interceptor, frigate,
 *     cruiser, battlecruiser). Flagship is rejected by the schema.
 */
export const DEFAULT_ANOMALY_EVENTS: AnomalyEventEntryInput[] = [
  // ─── EARLY (depths 1-7) ────────────────────────────────────────────────────
  {
    id: 'epave-spectrale',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Épave Spectrale',
    description:
      "Une carcasse luminescente dérive devant votre proue. Sa coque semble intacte, mais les ponts sont déserts. Quelque chose a chassé l'équipage avant de partir.",
    choices: [
      {
        label: 'Approcher prudemment',
        hidden: true,
        outcome: { minerai: 1500, silicium: 800 },
        resolutionText:
          'Les caissons sont remplis de minerais inertes — un cargo abandonné en plein convoi.',
      },
      {
        label: 'Récupérer le générateur',
        hidden: false,
        outcome: { hydrogene: 400 },
        resolutionText:
          "Le générateur cale et explose ; vos vaisseaux captent l'énergie résiduelle.",
      },
      {
        label: 'Ignorer et passer',
        hidden: false,
        outcome: {},
        resolutionText: "Vous gardez le cap. L'épave dérive dans le vide.",
      },
    ],
  },
  {
    id: 'signal-detresse',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'early',
    image: '',
    title: 'Signal de Détresse',
    description:
      "Un appel SOS sur la fréquence d'urgence civile. Trois mots seulement, en boucle : 'survivants — coordonnées — réponse'.",
    choices: [
      {
        label: "Répondre à l'appel",
        hidden: false,
        outcome: { shipsGain: { interceptor: 5 } },
        resolutionText: 'Trois pilotes rescapés rejoignent votre escadron, leurs vaisseaux en remorque.',
      },
      {
        label: 'Triangulation seule',
        hidden: true,
        outcome: { hydrogene: -300 },
        resolutionText:
          "Le signal était un piège — vos boucliers tiennent mais vous brûlez du carburant pour esquiver l'embuscade.",
      },
      {
        label: 'Couper la fréquence',
        hidden: false,
        outcome: {},
        resolutionText: "Vous coupez. Le signal s'éteint dans le vide.",
      },
    ],
  },
  {
    id: 'vortex-mineur',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Vortex Mineur',
    description:
      'Un mini-vortex se forme devant votre proue. Il scintille de cristaux quantiques mais ses turbulences sont imprévisibles.',
    choices: [
      {
        label: 'Foncer dedans',
        hidden: true,
        outcome: { hullDelta: -0.15, silicium: 2000 },
        resolutionText:
          'Secousse violente — vos boucliers craquent mais des cristaux quantiques restent piégés dans le hull.',
      },
      {
        label: 'Le contourner',
        hidden: false,
        outcome: { hydrogene: -100 },
        resolutionText: 'Détour propre, peu de carburant consommé.',
      },
    ],
  },
  {
    id: 'station-abandonnee',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'early',
    image: '',
    title: 'Station Abandonnée',
    description:
      "Une vieille station d'observation, déserte depuis douze ans. Les terminaux clignotent encore.",
    choices: [
      {
        label: 'Fouiller les quartiers',
        hidden: false,
        outcome: { minerai: 800, silicium: 400 },
        resolutionText: 'Vivres et matériel récupérés méthodiquement.',
      },
      {
        label: 'Pirater le terminal central',
        hidden: true,
        outcome: { exilium: 1 },
        resolutionText:
          "Coordonnées d'une autre anomalie — données encodées en exilium pur.",
      },
      {
        label: 'Détruire la station',
        hidden: false,
        outcome: { shipsLoss: { interceptor: 2 } },
        resolutionText: 'Une charge mal placée déstabilise vos boucliers — deux interceptors perdus.',
      },
    ],
  },
  {
    id: 'marchand-nomade',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'early',
    image: '',
    title: 'Marchand Nomade',
    description:
      "Un vaisseau ancien arbore le pavillon des marchands exilés. Le pilote, un vieil homme barbu, vous fait signe d'approcher.",
    choices: [
      {
        label: 'Acheter du carburant',
        hidden: false,
        outcome: { minerai: -2000, hydrogene: 1500 },
        resolutionText: 'Le vieil homme prend le minerai et remplit vos réservoirs.',
      },
      {
        label: 'Acheter des frégates',
        hidden: false,
        outcome: { silicium: -3000, shipsGain: { frigate: 3 } },
        resolutionText: 'Trois frégates remises en état, payées comptant.',
      },
      {
        label: 'Refuser et continuer',
        hidden: false,
        outcome: {},
        resolutionText: "Le marchand hausse les épaules et s'éloigne dans le vide.",
      },
    ],
  },
  {
    id: 'debris-pirates',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Débris Pirates',
    description:
      "Les restes d'un convoi pirate flottent entre les nœuds, encore tièdes des combats récents.",
    choices: [
      {
        label: 'Récupérer les pièces',
        hidden: false,
        outcome: { minerai: 1000, silicium: 1000 },
        resolutionText: 'Bonne récolte sur les coques éventrées.',
      },
      {
        label: 'Désamorcer les charges',
        hidden: true,
        outcome: { hullDelta: 0.1 },
        resolutionText:
          'Vous récupérez des plaques de blindage utilisables et renforcez les coques.',
      },
    ],
  },
  {
    id: 'coque-fantome',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'early',
    image: '',
    title: 'Coque Fantôme',
    description:
      "Une coque vide dérive, illuminée de l'intérieur par une lueur bleutée. Personne ne répond aux hails.",
    choices: [
      {
        label: 'Envoyer un drone',
        hidden: true,
        outcome: { silicium: 1500 },
        resolutionText: 'Le drone ramène des composants intacts du noyau.',
      },
      {
        label: 'Tirer à vue',
        hidden: true,
        outcome: { shipsLoss: { frigate: 1 } },
        resolutionText: "L'explosion endommage votre frégate la plus proche.",
      },
      {
        label: 'Continuer la route',
        hidden: false,
        outcome: {},
        resolutionText: 'Vous laissez la coque dériver, intacte.',
      },
    ],
  },
  {
    id: 'tempete-particulaire',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Tempête Particulaire',
    description:
      'Un nuage dense de particules ralentit votre propagation. Certains pilotes parlent de poussière de cristaux récupérables.',
    choices: [
      {
        label: 'Traverser à pleine vitesse',
        hidden: true,
        outcome: { hullDelta: -0.1, hydrogene: 500 },
        resolutionText: 'Les particules récoltées dans les filtres sont valorisables.',
      },
      {
        label: "Patienter à l'écart",
        hidden: false,
        outcome: {},
        resolutionText: "L'avancée est ralentie mais sans dégâts.",
      },
    ],
  },
  {
    id: 'pirate-renegat',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'early',
    image: '',
    title: 'Pirate Rénégat',
    description:
      'Un pirate solitaire vous accoste. Sa proposition est simple : un échange de vaisseaux, sans questions.',
    choices: [
      {
        label: 'Échanger 3 interceptors contre 1 cruiser',
        hidden: false,
        outcome: { shipsLoss: { interceptor: 3 }, shipsGain: { cruiser: 1 } },
        resolutionText: 'Le deal se fait. Le pirate semble pressé de partir.',
      },
      {
        label: 'Refuser et fuir',
        hidden: false,
        outcome: {},
        resolutionText: "Vous coupez la communication et accélérez.",
      },
    ],
  },
  {
    id: 'antique-balise',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Antique Balise',
    description:
      "Une balise des temps anciens émet en boucle un message chiffré. Sa source d'énergie semble inépuisable.",
    choices: [
      {
        label: 'Décoder le message',
        hidden: true,
        outcome: { exilium: 2 },
        resolutionText:
          "Les coordonnées d'un cache d'exilium — chiffrées pour les navigateurs initiés.",
      },
      {
        label: 'Détruire la balise',
        hidden: false,
        outcome: { minerai: 500 },
        resolutionText: 'Les composants vous reviennent.',
      },
    ],
  },

  // ─── MID (depths 8-14) ─────────────────────────────────────────────────────
  {
    id: 'flotte-fantome',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Flotte Fantôme',
    description:
      "Une flotte fantôme apparaît brièvement sur les radars, puis s'efface. Mais les capteurs restent agités.",
    choices: [
      {
        label: 'Engager le contact',
        hidden: true,
        outcome: { shipsGain: { frigate: 8 } },
        resolutionText:
          "Les vaisseaux s'avèrent réels. Leurs équipages, traumatisés, rejoignent votre flotte.",
      },
      {
        label: 'Suivre à distance',
        hidden: false,
        outcome: { silicium: 3000 },
        resolutionText: "Vous trouvez leur dépôt — ils l'avaient oublié.",
      },
      {
        label: 'Ignorer',
        hidden: false,
        outcome: {},
        resolutionText: "Vous tournez le dos. Le radar redevient calme.",
      },
    ],
  },
  {
    id: 'base-pirate-effondree',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Base Pirate Effondrée',
    description:
      "Les ruines d'une base pirate, victime d'un raid récent. Les corps n'ont pas encore refroidi.",
    choices: [
      {
        label: 'Fouiller méthodiquement',
        hidden: false,
        outcome: { minerai: 5000, silicium: 3000 },
        resolutionText: 'Trésor de guerre intact — les pillards sont partis trop vite.',
      },
      {
        label: "Activer le système d'alarme",
        hidden: true,
        outcome: { shipsLoss: { cruiser: 2 }, shipsGain: { interceptor: 12 } },
        resolutionText:
          "Le système s'autodétruit, mais des escadrons captifs se rallient à vous.",
      },
    ],
  },
  {
    id: 'marchand-anomal',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Marchand Anomal',
    description:
      "Un marchand spécialisé dans l'exilium recyclé vous propose ses services depuis une station mobile.",
    choices: [
      {
        label: 'Acheter 6 frégates',
        hidden: false,
        outcome: { exilium: -3, shipsGain: { frigate: 6 } },
        resolutionText: 'Six frégates de seconde main, fonctionnelles.',
      },
      {
        label: 'Acheter un blindage renforcé',
        hidden: false,
        outcome: { exilium: -2, hullDelta: 0.3 },
        resolutionText: "L'équipe de soudure travaille toute la nuit. Vos coques tiennent mieux.",
      },
      {
        label: 'Vendre des reliques',
        hidden: true,
        outcome: { exilium: 5 },
        resolutionText:
          'Le marchand reconnaît une pièce rare et paie en exilium pur — beaucoup plus que la mise.',
      },
    ],
  },
  {
    id: 'anomalie-stable',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Anomalie Stable',
    description:
      "Une zone de calme quantique au cœur de l'anomalie. Les capteurs sont silencieux pour la première fois depuis l'engage.",
    choices: [
      {
        label: 'Réparer la flotte',
        hidden: false,
        outcome: { hullDelta: 0.4 },
        resolutionText: "L'équipage profite du calme pour souder des plaques.",
      },
      {
        label: 'Récolter à la dérive',
        hidden: true,
        outcome: { hydrogene: 5000 },
        resolutionText: 'Vous capturez de l\'hydrogène lourd dans la zone stable.',
      },
      {
        label: 'Repartir avant le piège',
        hidden: false,
        outcome: {},
        resolutionText: 'Décision prudente. La zone se referme derrière vous.',
      },
    ],
  },
  {
    id: 'embuscade-pirate',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Embuscade Pirate',
    description:
      "Trois vaisseaux pirates surgissent d'un nuage de gaz. Pas le temps de fuir.",
    choices: [
      {
        label: 'Combattre',
        hidden: true,
        outcome: { shipsLoss: { interceptor: 4 }, minerai: 4000 },
        resolutionText:
          'Vous gagnez l\'échange mais perdez quatre interceptors. Leur cargo vous récompense.',
      },
      {
        label: 'Négocier le passage',
        hidden: false,
        outcome: { exilium: -3 },
        resolutionText: 'Ils acceptent un péage. Pratiques, mais coûteux.',
      },
    ],
  },
  {
    id: 'carcasse-monumentale',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Carcasse Monumentale',
    description:
      "La carcasse d'un destroyer ancien, à moitié engloutie dans le vortex. Sa cargaison promet, mais le découpage est risqué.",
    choices: [
      {
        label: 'Découper la coque',
        hidden: true,
        outcome: { hullDelta: -0.2, minerai: 8000, silicium: 5000 },
        resolutionText: 'Les coques sont abîmées, mais le butin est massif.',
      },
      {
        label: 'Récupérer les fragments flottants',
        hidden: false,
        outcome: { minerai: 3000, silicium: 1500 },
        resolutionText: 'Plus prudent. Moins lucratif.',
      },
    ],
  },
  {
    id: 'station-medicale',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Station Médicale',
    description:
      "Une vieille station hospitalière, déserte depuis des années. Les bras nano-réparateurs s'agitent encore au passage des ombres.",
    choices: [
      {
        label: 'Visiter le bloc opératoire',
        hidden: false,
        outcome: { hullDelta: 0.25 },
        resolutionText: 'Les nano-réparateurs encore actifs colmatent vos coques.',
      },
      {
        label: 'Forcer le cargo médical',
        hidden: true,
        outcome: { exilium: 3 },
        resolutionText: "Stocks d'exilium médical — valeur élevée sur les marchés noirs.",
      },
      {
        label: 'Bloquer les accès et partir',
        hidden: false,
        outcome: {},
        resolutionText: 'Décision prudente. La station retombe dans son silence.',
      },
    ],
  },
  {
    id: 'convoi-perdu',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Convoi Perdu',
    description:
      "Un convoi de transport civil dérive sans équipage. Les soutes sont scellées, mais le vaisseau-mère semble pilotable.",
    choices: [
      {
        label: 'Récupérer la cargaison',
        hidden: false,
        outcome: { minerai: 6000 },
        resolutionText: 'Soutes pleines, équipage évanoui dans le vide.',
      },
      {
        label: 'Embarquer le vaisseau-mère',
        hidden: false,
        outcome: { shipsLoss: { cruiser: 1 }, shipsGain: { battlecruiser: 1 } },
        resolutionText:
          'Vous échangez un cruiser pour piloter le transport — un rafiot lourd mais robuste.',
      },
    ],
  },
  {
    id: 'mineur-renegat',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'mid',
    image: '',
    title: 'Mineur Rénégat',
    description:
      'Un mineur isolé, ses filets pleins de cristaux quantiques, propose ses services en échange de provisions.',
    choices: [
      {
        label: 'Engager pour réparations',
        hidden: false,
        outcome: { silicium: -1500, hullDelta: 0.2 },
        resolutionText: 'Réparations sur place avant qu\'il ne reparte vers la prochaine veine.',
      },
      {
        label: 'Voler son matériel',
        hidden: true,
        outcome: { silicium: 2000, shipsLoss: { interceptor: 2 } },
        resolutionText: 'Sa contre-attaque coûte cher mais le butin paie.',
      },
    ],
  },
  {
    id: 'piege-quantique',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Piège Quantique',
    description:
      "Un nœud de l'anomalie semble bloqué par une membrane énergétique. Forcer ou contourner ?",
    choices: [
      {
        label: 'Forcer le passage',
        hidden: true,
        outcome: { hullDelta: -0.3, exilium: 2 },
        resolutionText: "L'effort cogne fort mais cristallise de l'exilium pur dans les coques.",
      },
      {
        label: 'Détourner par le vide',
        hidden: false,
        outcome: { hydrogene: -2000 },
        resolutionText: 'Détour coûteux en carburant, mais aucun dégât.',
      },
    ],
  },

  // ─── DEEP (depths 15-20) ───────────────────────────────────────────────────
  {
    id: 'sanctuaire-ancien',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Sanctuaire Ancien',
    description:
      "Un sanctuaire des Premiers, intact malgré les âges. Les pierres murmurent une langue oubliée.",
    choices: [
      {
        label: "Méditer à l'intérieur",
        hidden: false,
        outcome: { hullDelta: 0.5, exilium: 5 },
        resolutionText: 'Les pierres murmurent. Vous repartez restauré, vos réservoirs pleins d\'exilium.',
      },
      {
        label: 'Piller les reliques',
        hidden: true,
        outcome: { minerai: 20000, shipsLoss: { cruiser: 3 } },
        resolutionText: 'Les gardiens dormants se réveillent au moment où vous fuyez.',
      },
    ],
  },
  {
    id: 'flotte-cimetiere',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Flotte Cimetière',
    description:
      "Le cimetière silencieux d'une flotte impériale. Des centaines de coques flottent en formation rigide, comme figées par le temps.",
    choices: [
      {
        label: 'Récupérer un destroyer',
        hidden: true,
        outcome: { shipsGain: { battlecruiser: 1 }, hullDelta: -0.2 },
        resolutionText:
          'Le vaisseau vous obéit mais ses systèmes mordent dans vos boucliers — il a sa propre volonté.',
      },
      {
        label: 'Inspecter les caissons',
        hidden: false,
        outcome: { minerai: 12000, silicium: 8000 },
        resolutionText: 'Les soutes sont pleines, intactes depuis des décennies.',
      },
    ],
  },
  {
    id: 'portail-instable',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Portail Instable',
    description:
      'Une déchirure spatiale, stable depuis quelques minutes seulement. Un raccourci, ou un piège — impossible à savoir avant le saut.',
    choices: [
      {
        label: 'Sauter par-dessus',
        hidden: true,
        outcome: { exilium: 3, hydrogene: 5000 },
        resolutionText:
          "Vous économisez deux heures de transit. Le saut cristallise de l'exilium dans vos réservoirs.",
      },
      {
        label: 'Refuser le risque',
        hidden: false,
        outcome: {},
        resolutionText: "Le portail se referme derrière vous. Décision sage, peut-être.",
      },
    ],
  },
  {
    id: 'fantome-imperial',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Fantôme Impérial',
    description:
      "Un destroyer impérial vide vous accoste, ses sas grand ouverts. C'est une invitation tacite, ou une malédiction.",
    choices: [
      {
        label: 'Le rejoindre',
        hidden: false,
        outcome: { shipsLoss: { cruiser: 5 }, shipsGain: { battlecruiser: 1 } },
        resolutionText:
          "Cinq cruisers fusionnés en un battlecruiser fantôme — ses systèmes restent autonomes.",
      },
      {
        label: 'Attaquer le fantôme',
        hidden: true,
        outcome: { shipsLoss: { interceptor: 8 }, silicium: 12000 },
        resolutionText: 'Combat coûteux mais le butin est vaste.',
      },
    ],
  },
  {
    id: 'convoi-marchand-prospere',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Convoi Marchand Prospère',
    description:
      "Une caravane riche en exilium, escortée mais distraite. Trois choix : l'achat, le pillage, ou l'indifférence.",
    choices: [
      {
        label: 'Acheter en gros',
        hidden: false,
        outcome: { exilium: -10, shipsGain: { frigate: 30 } },
        resolutionText: "L'escorte rit mais accepte. Trente frégates rejoignent votre flotte.",
      },
      {
        label: "Piller à l'aube",
        hidden: true,
        outcome: { shipsLoss: { frigate: 10 }, exilium: 25 },
        resolutionText: "Combat dur, mais l'exilium emporté est colossal.",
      },
      {
        label: 'Saluer poliment',
        hidden: false,
        outcome: {},
        resolutionText: "L'escorte salue en retour. Vous passez sans encombre.",
      },
    ],
  },
  {
    id: 'abime-noir',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Abîme Noir',
    description:
      "Au centre du nœud, un abîme noir, sans fond visible. Les capteurs s'effacent dès qu'ils s'en approchent.",
    choices: [
      {
        label: 'Y descendre',
        hidden: true,
        outcome: { minerai: 30000, silicium: 20000, hullDelta: -0.4 },
        resolutionText: "Vous frôlez l'effondrement mais remontez chargés.",
      },
      {
        label: 'Largage de drones',
        hidden: false,
        outcome: { minerai: 8000 },
        resolutionText: "Drones perdus, butin modeste mais sûr.",
      },
    ],
  },
  {
    id: 'gardien-eveille',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Gardien Éveillé',
    description:
      "Un gardien-construct des Premiers vous teste. Sa voix résonne dans tous les vaisseaux : 'Combat, tribut, ou silence ?'",
    choices: [
      {
        label: 'Combattre par fierté',
        hidden: true,
        outcome: { shipsLoss: { interceptor: 15 }, shipsGain: { cruiser: 5 }, exilium: 3 },
        resolutionText:
          "Combat féroce. Le construct laisse en récompense des plans et de l'exilium ancien.",
      },
      {
        label: 'Offrir un tribut',
        hidden: false,
        outcome: { minerai: -5000, silicium: -5000, hullDelta: 0.3 },
        resolutionText: 'Le gardien reconnaît votre humilité et remet vos coques en état.',
      },
      {
        label: 'Le contourner par le bas',
        hidden: false,
        outcome: { hydrogene: -3000 },
        resolutionText: 'Détour coûteux mais discret. Le gardien ne vous suit pas.',
      },
    ],
  },
  {
    id: 'archive-perdue',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Archive Perdue',
    description:
      "Une archive de la Cité-Tombeau apparaît dans un éclat de lumière froide. Ses pages s'écrivent en exilium sur l'air.",
    choices: [
      {
        label: "Lire l'archive entière",
        hidden: true,
        outcome: { exilium: 8 },
        resolutionText: 'Connaissances qui valent fortune en exilium pur.',
      },
      {
        label: "Brûler l'archive",
        hidden: false,
        outcome: {},
        resolutionText: 'Le geste libère une vague de chaleur — purement esthétique.',
      },
    ],
  },
  {
    id: 'reine-pirate',
    enabled: false, // V4 (2026-05-03) : outcome shipsGain/shipsLoss incompatible flagship-only — à refondre en V5
    tier: 'deep',
    image: '',
    title: 'Reine Pirate',
    description:
      "Une reine pirate isolée, son vaisseau-amiral en feu, vous fait signe. Sa flotte la suit comme un nuage de mouches.",
    choices: [
      {
        label: 'Lui offrir asile',
        hidden: false,
        outcome: { shipsGain: { battlecruiser: 1, frigate: 20 } },
        resolutionText: 'Elle accepte. Sa flotte rejoint la vôtre, fidèle pour le restant de la run.',
      },
      {
        label: 'Achever son vaisseau',
        hidden: true,
        outcome: { shipsLoss: { cruiser: 5 }, silicium: 15000, exilium: 8 },
        resolutionText: "Combat brutal mais son trésor est immense.",
      },
      {
        label: 'Refuser et fuir',
        hidden: false,
        outcome: {},
        resolutionText: 'Vous coupez les communications et accélérez.',
      },
    ],
  },
  {
    id: 'coeur-anomalie',
    enabled: true,
    tier: 'deep',
    image: '',
    title: "Cœur de l'Anomalie",
    description:
      "Le cœur pulsant de l'anomalie elle-même. Une sphère d'exilium liquide, vivante, qui semble vous reconnaître.",
    choices: [
      {
        label: "S'en approcher",
        hidden: true,
        outcome: { hullDelta: 0.6, exilium: 10 },
        resolutionText:
          "Vous touchez le cœur. Vos coques se reforment, l'exilium afflue dans vos réservoirs.",
      },
      {
        label: 'Garder ses distances',
        hidden: false,
        outcome: { minerai: 5000, silicium: 5000, hydrogene: 5000 },
        resolutionText: 'Vous récoltez les particules en orbite, sans risque.',
      },
    ],
  },

  // ─── V8.14 (2026-05-04) — Multi-choice + tone + skill checks ─────────────────
  // Ajouts qui exploitent les nouvelles features : 4-5 choix, tones explicites,
  // tests techniques avec failureOutcome (recherche insuffisante = malus au lieu
  // de blocage). Conçus pour être lisibles côté UI : positive/risky/negative
  // donnent au joueur une lecture rapide du danger.
  {
    id: 'embuscade-pirate-v2',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Embuscade Pirate (Renforcée)',
    description:
      "Une bande de pirates émerge de l'anomalie. Leur chef hurle vos coordonnées sur la fréquence d'urgence. Quatre options s'offrent à vous.",
    choices: [
      {
        label: 'Combattre frontalement',
        tone: 'risky',
        outcome: { hullDelta: -0.15, minerai: 2000 },
        resolutionText: 'Vous repoussez l\'attaque mais votre coque encaisse de lourds dégâts. Le butin pirate est récupéré.',
      },
      {
        label: 'Négocier (−2 exilium)',
        tone: 'neutral',
        outcome: { exilium: -2 },
        resolutionText: 'Le pirate empoche le tribut et libère le passage.',
      },
      {
        label: 'Bluffer en signature impériale (Énergie 5)',
        tone: 'risky',
        requiredResearch: { researchId: 'energyTech', minLevel: 5 },
        outcome: { exilium: 1, hydrogene: 1500, silicium: 1000 },
        resolutionText:
          "Vous projetez une signature falsifiée d'escorte impériale. Les pirates s'enfuient et abandonnent une cache.",
        failureOutcome: { hullDelta: -0.25, exilium: -1 },
        failureResolutionText: 'Votre bluff échoue lamentablement. Les pirates rient avant de tirer — votre coque morfle.',
      },
      {
        label: 'Fuir à pleine puissance',
        tone: 'positive',
        outcome: { hydrogene: -800 },
        resolutionText: 'Vous brûlez du carburant pour fuir, mais sortez intact.',
      },
    ],
  },
  {
    id: 'artefact-cite-tombeau',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Artefact de la Cité-Tombeau',
    description:
      "Un artefact pulse au cœur d'un nid de capteurs anciens. Cinq options, chacune avec ses propres règles.",
    choices: [
      {
        label: 'Le saisir à mains nues',
        tone: 'negative',
        hidden: true,
        outcome: { hullDelta: -0.3, exilium: 4 },
        resolutionText: 'Une décharge fauche votre équipage. L\'artefact contient toutefois de l\'exilium pur.',
      },
      {
        label: 'Le scanner (Capteurs 6)',
        tone: 'positive',
        requiredResearch: { researchId: 'sensorNetwork', minLevel: 6 },
        outcome: { exilium: 6, silicium: 4000 },
        resolutionText: 'Le scan révèle une fréquence de désactivation. L\'artefact se laisse cueillir sans dégâts.',
        failureOutcome: { hullDelta: -0.15 },
        failureResolutionText:
          'Vos capteurs sont trop primitifs. Le scan déclenche les défenses de l\'artefact et secoue la coque.',
      },
      {
        label: 'Forcer avec des boucliers (Boucliers 7)',
        tone: 'risky',
        requiredResearch: { researchId: 'shielding', minLevel: 7 },
        outcome: { exilium: 5, minerai: 6000 },
        resolutionText: 'Vos boucliers absorbent la décharge. L\'artefact tombe dans vos mains sans casse.',
        failureOutcome: { hullDelta: -0.4 },
        failureResolutionText: 'Vos boucliers craquent sous la décharge. La coque morfle gravement mais vous repartez bredouille.',
      },
      {
        label: 'Détruire à distance',
        tone: 'neutral',
        outcome: { silicium: 1500 },
        resolutionText: 'L\'artefact explose. Vous récupérez quelques fragments dans les débris.',
      },
      {
        label: 'Laisser dériver',
        tone: 'positive',
        outcome: {},
        resolutionText: 'Vous gardez le cap, prudemment. L\'artefact reste là, intouché.',
      },
    ],
  },
  {
    id: 'champ-asteroides-dense',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Champ d\'Astéroïdes Dense',
    description:
      'Un champ d\'astéroïdes traverse votre route. Riche en minerais, mais traverser à l\'aveugle peut coûter cher.',
    choices: [
      {
        label: 'Foncer dans le tas',
        tone: 'negative',
        outcome: { hullDelta: -0.2, minerai: 2500 },
        resolutionText: 'Les impacts sont nombreux mais votre coque ramène un beau butin de minerai.',
      },
      {
        label: 'Naviguer en propulsion fine (Impulsion 4)',
        tone: 'positive',
        requiredResearch: { researchId: 'impulse', minLevel: 4 },
        outcome: { minerai: 3500, silicium: 1000 },
        resolutionText: 'Vos vaisseaux dansent entre les rochers. Récolte propre et abondante.',
        failureOutcome: { hullDelta: -0.1, minerai: 800 },
        failureResolutionText:
          'Sans propulsion fine, vous frottez plus que prévu. Récolte modeste, coque cabossée.',
      },
      {
        label: 'Contourner par le vide',
        tone: 'positive',
        outcome: { hydrogene: -500 },
        resolutionText: 'Détour propre, peu de carburant consommé.',
      },
    ],
  },
  {
    id: 'cache-imperiale-abandonnee',
    enabled: true,
    tier: 'mid',
    image: '',
    title: 'Cache Impériale Abandonnée',
    description:
      "Un dépôt impérial scellé, oublié dans une poche stable de l'anomalie. Le verrouillage est ancien mais coriace.",
    choices: [
      {
        label: 'Forcer la porte au laser',
        tone: 'risky',
        outcome: { hullDelta: -0.1, minerai: 4000 },
        resolutionText: 'La porte cède. Le butin est solide, mais l\'auto-défense vous a éraflé.',
      },
      {
        label: 'Pirater le verrou (Informatique 5)',
        tone: 'positive',
        requiredResearch: { researchId: 'computerTech', minLevel: 5 },
        outcome: { minerai: 6000, silicium: 4000, exilium: 2 },
        resolutionText: 'Le verrou cède sous votre intrusion. Cache vidée proprement.',
        failureOutcome: { hullDelta: -0.2 },
        failureResolutionText: 'Le verrou détecte votre intrusion. Une charge piégée explose contre votre coque.',
      },
      {
        label: 'Décoder le manifest (Espionnage 4)',
        tone: 'risky',
        requiredResearch: { researchId: 'espionageTech', minLevel: 4 },
        outcome: { exilium: 3 },
        resolutionText: 'Le manifest révèle l\'emplacement d\'un cache plus juteux ailleurs. Données monétisées en exilium.',
        failureOutcome: {},
        failureResolutionText: 'Sans expertise en espionnage, le manifest reste illisible. Vous repartez bredouille.',
      },
      {
        label: 'Marquer la cache et passer',
        tone: 'neutral',
        outcome: {},
        resolutionText: 'Vous notez les coordonnées et continuez la route. La cache attendra.',
      },
    ],
  },
  {
    id: 'cache-abandonnee-paisible',
    enabled: true,
    tier: 'early',
    image: '',
    title: 'Cache Abandonnée',
    description:
      'Une vieille cache de prospecteurs, sans piège ni surveillance. Le seul choix qui se pose, c\'est ce que vous prenez.',
    choices: [
      {
        label: 'Charger les minerais',
        tone: 'positive',
        outcome: { minerai: 2500 },
        resolutionText: 'Caissons remplis. Travail propre.',
      },
      {
        label: 'Charger le silicium',
        tone: 'positive',
        outcome: { silicium: 2500 },
        resolutionText: 'Cristaux récupérés en bon état.',
      },
      {
        label: 'Charger l\'hydrogène',
        tone: 'positive',
        outcome: { hydrogene: 2000 },
        resolutionText: 'Réservoirs remplis sans incident.',
      },
    ],
  },
  {
    id: 'tempete-electromagnetique',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Tempête Électromagnétique',
    description:
      'Une tempête EM enveloppe le secteur. Elle paralyse les capteurs mais agit comme un brouilleur naturel — risque ou opportunité ?',
    choices: [
      {
        label: 'Traverser sans réfléchir',
        tone: 'negative',
        outcome: { hullDelta: -0.25 },
        resolutionText: 'Les surcharges grillent vos systèmes. Coque salement abîmée.',
      },
      {
        label: 'Blindage spécial (Armure 8)',
        tone: 'positive',
        requiredResearch: { researchId: 'armor', minLevel: 8 },
        outcome: { hullDelta: 0.1, exilium: 3 },
        resolutionText: 'Votre blindage canalise les décharges et capte de l\'exilium en condensé.',
        failureOutcome: { hullDelta: -0.3 },
        failureResolutionText: 'Votre blindage est insuffisant. La tempête le fait fondre par endroits.',
      },
      {
        label: 'Recharger les boucliers à la tempête (Boucliers 6)',
        tone: 'risky',
        requiredResearch: { researchId: 'shielding', minLevel: 6 },
        outcome: { hullDelta: 0.2 },
        resolutionText: 'Vos boucliers absorbent l\'énergie ambiante. Coque réparée par auto-régulation.',
        failureOutcome: { hullDelta: -0.15 },
        failureResolutionText: 'Vos boucliers obsolètes ne supportent pas la charge. Surchauffe et dégâts internes.',
      },
      {
        label: 'Attendre la fin de la tempête',
        tone: 'neutral',
        outcome: { hydrogene: -1000 },
        resolutionText: 'Vous brûlez du carburant à tourner sur place, mais en sortez intact.',
      },
    ],
  },
  {
    id: 'derelict-armes-experimentales',
    enabled: true,
    tier: 'deep',
    image: '',
    title: 'Derelict Armé Expérimental',
    description:
      'Un destroyer expérimental, ses tourelles encore armées et asservies à un IA dégradée. Quatre approches possibles, chacune avec son tempo.',
    choices: [
      {
        label: 'Désactiver à mains nues',
        tone: 'negative',
        outcome: { hullDelta: -0.4, silicium: 5000 },
        resolutionText: 'L\'IA se défend férocement. Vous récupérez le butin mais payez le prix fort.',
      },
      {
        label: 'Pirater l\'IA (Informatique 8)',
        tone: 'positive',
        requiredResearch: { researchId: 'computerTech', minLevel: 8 },
        outcome: { silicium: 8000, exilium: 5 },
        resolutionText: 'L\'IA se rend. Vous démantelez le destroyer pièce par pièce, sans dégâts.',
        failureOutcome: { hullDelta: -0.35 },
        failureResolutionText: 'L\'IA détecte votre tentative et active toutes ses défenses. Combat brutal pour battre en retraite.',
      },
      {
        label: 'Surcharger ses armes (Armes 7)',
        tone: 'risky',
        requiredResearch: { researchId: 'weapons', minLevel: 7 },
        outcome: { silicium: 6000, minerai: 4000 },
        resolutionText: 'Vous induisez une surcharge des batteries. L\'IA explose, le butin reste intact.',
        failureOutcome: { hullDelta: -0.5 },
        failureResolutionText: 'Votre tentative de surcharge échoue. Les armes se retournent contre vous violemment.',
      },
      {
        label: 'Saluer et passer',
        tone: 'positive',
        outcome: {},
        resolutionText: 'Vous gardez le cap. L\'IA ne vous voit même pas.',
      },
    ],
  },
];
