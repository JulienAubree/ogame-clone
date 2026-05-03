import { useMemo } from 'react';
import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '@exilium/api/trpc';
import { trpc } from '@/trpc';

export type HomepageContent = inferRouterOutputs<AppRouter>['homepage']['get'];

/**
 * Mirror of the API DEFAULT_HOMEPAGE_CONTENT — keeps the public landing
 * renderable even before the tRPC query resolves (or if it fails). Strings
 * are deliberately matched so SSR-like flicker stays minimal.
 */
const FALLBACK: HomepageContent = {
  nav: {
    items: [
      { label: 'Accueil', href: '#accueil' },
      { label: "L'Univers", href: '#univers' },
      { label: 'Gameplay', href: '#gameplay' },
      { label: 'Galerie', href: '#galerie' },
      { label: 'Actualités', href: '/changelog' },
    ],
  },
  hero: {
    eyebrow: '',
    title: 'EXILIUM',
    tagline: 'SURVIVRE. CONSTRUIRE. CONQUÉRIR.',
    description:
      "Exilium est un jeu de stratégie et d'action se déroulant dans un univers lointain, où l'humanité lutte pour sa survie face à des menaces inconnues.",
    primaryCta: { label: 'Inscription bêta', href: '/register' },
    secondaryCta: { label: 'Regarder le trailer', href: '#trailer' },
    backgroundImage: '/assets/landing/hero.webp',
  },
  pillars: {
    title: 'Un univers sans limites',
    items: [
      { title: 'Explorer', description: 'Parcourez des planètes inconnues et découvrez des ressources rares.', icon: 'planet', image: '' },
      { title: 'Construire', description: 'Développez votre base, recherchez des technologies avancées et renforcez votre empire.', icon: 'building', image: '' },
      { title: 'Combattre', description: 'Menez des batailles stratégiques en temps réel et dominez vos ennemis.', icon: 'sword', image: '' },
      { title: 'Alliance', description: "Formez des alliances, participez à des événements mondiaux et écrivez l'histoire d'Exilium.", icon: 'shield', image: '' },
    ],
  },
  immersive: {
    title: 'Univers immersif',
    description:
      'Des environnements spectaculaires, des technologies futuristes et une histoire captivante.',
    ctaLabel: 'Découvrir la galerie',
    ctaHref: '#galerie',
    images: [
      { src: '/assets/landing/immersive-1.webp', alt: 'Paysage glacial' },
      { src: '/assets/landing/immersive-2.webp', alt: 'Cité futuriste' },
      { src: '/assets/landing/immersive-3.webp', alt: 'Tour ardente' },
    ],
  },
  newsletter: {
    enabled: true,
    title: 'Rejoignez la résistance',
    description:
      "Inscrivez-vous dès maintenant pour participer à la bêta et façonner l'avenir d'Exilium.",
    submitLabel: "S'inscrire",
  },
  footer: {
    description:
      "Exilium est un jeu de stratégie et d'action dans un univers de science-fiction riche et immersif.",
    sections: [
      {
        title: 'Jeu',
        links: [
          { label: "L'Univers", href: '#univers' },
          { label: 'Gameplay', href: '#gameplay' },
          { label: 'Factions', href: '#factions' },
          { label: 'Actualités', href: '/changelog' },
        ],
      },
      {
        title: 'Ressources',
        links: [
          { label: 'FAQ', href: '#faq' },
          { label: 'Supports', href: '#supports' },
          { label: 'Presse', href: '#presse' },
          { label: 'Carrières', href: '#carrieres' },
        ],
      },
      {
        title: 'Légal',
        links: [
          { label: 'Mentions légales', href: '/legal' },
          { label: 'Politique de confidentialité', href: '/privacy' },
          { label: "Conditions d'utilisation", href: '/terms' },
        ],
      },
    ],
    socials: [
      { platform: 'discord', href: 'https://discord.gg/exilium' },
      { platform: 'twitter', href: 'https://twitter.com/exilium' },
      { platform: 'youtube', href: 'https://youtube.com/@exilium' },
      { platform: 'facebook', href: 'https://facebook.com/exilium' },
    ],
    legalNote: `© ${new Date().getFullYear()} Exilium. Tous droits réservés.`,
  },
};

/**
 * Fetches the homepage content from tRPC. Always returns a usable shape:
 * the bundled fallback while loading or if the request fails. Cached
 * aggressively since this is an admin-edited blob.
 */
export function useHomepageContent(): HomepageContent {
  const { data } = trpc.homepage.get.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  return useMemo(() => data ?? FALLBACK, [data]);
}
