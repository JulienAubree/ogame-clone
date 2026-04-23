import { LandingHeader } from '@/components/landing/LandingHeader';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingPillars } from '@/components/landing/LandingPillars';
import { LandingShowcase } from '@/components/landing/LandingShowcase';
import { LandingLoginForm } from '@/components/landing/LandingLoginForm';
import { LandingFinalCta } from '@/components/landing/LandingFinalCta';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function Login() {
  return (
    <div className="min-h-dvh bg-background bg-stars text-foreground">
      <LandingHeader />
      <main>
        <LandingHero />
        <LandingPillars />
        <LandingShowcase />
        <LandingLoginForm />
        <LandingFinalCta />
      </main>
      <LandingFooter />
    </div>
  );
}
