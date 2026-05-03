import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingPillars } from '@/components/landing/LandingPillars';
import { LandingImmersive } from '@/components/landing/LandingImmersive';
import { LandingNewsletter } from '@/components/landing/LandingNewsletter';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { useHomepageContent } from '@/components/landing/useHomepageContent';

/**
 * Public homepage (`/`). Accessible without authentication. Authenticated
 * players still see this page — the header swaps to a "Mon empire" CTA so
 * they can jump back into the game without logging in again.
 */
export default function Landing() {
  const content = useHomepageContent();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <LandingHeader content={content} />
      <main>
        <LandingHero content={content} />
        <LandingPillars content={content} />
        <LandingImmersive content={content} />
        <LandingNewsletter content={content} />
      </main>
      <LandingFooter content={content} />
    </div>
  );
}
