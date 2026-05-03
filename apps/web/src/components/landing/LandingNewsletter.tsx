import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { HomepageContent } from './useHomepageContent';

interface LandingNewsletterProps {
  content: HomepageContent;
}

/**
 * "Join the resistance" CTA. Right now this is wired to bounce the email
 * straight to /register?email=… so the user lands on the inscription form
 * with their email pre-filled. If we ever build a real newsletter store, we
 * swap the navigate() for a tRPC mutation here.
 */
export function LandingNewsletter({ content }: LandingNewsletterProps) {
  const { newsletter } = content;
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  if (!newsletter.enabled) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) return;
    navigate(`/register?email=${encodeURIComponent(trimmed)}`);
  };

  return (
    <section
      id="inscription"
      className="relative overflow-hidden bg-gradient-to-b from-background via-[hsl(220,55%,5%)] to-background py-24 sm:py-32"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 60% at 50% 50%, hsla(200, 85%, 65%, 0.1) 0%, transparent 70%)',
        }}
      />

      <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
        {newsletter.title && (
          <h2 className="mb-4 text-2xl font-bold uppercase tracking-[0.2em] text-foreground sm:text-3xl md:text-4xl">
            {newsletter.title}
          </h2>
        )}
        <div
          aria-hidden
          className="mx-auto my-5 h-px w-16 bg-gradient-to-r from-transparent via-primary to-transparent"
        />
        {newsletter.description && (
          <p className="mx-auto mb-10 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {newsletter.description}
          </p>
        )}

        <form onSubmit={handleSubmit} className="mx-auto flex max-w-xl flex-col gap-3 sm:flex-row">
          <label htmlFor="newsletter-email" className="sr-only">
            Adresse email
          </label>
          <input
            id="newsletter-email"
            type="email"
            required
            placeholder="Votre adresse e-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-md border border-white/10 bg-card/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            className="rounded-md bg-primary px-6 py-3 text-sm font-semibold uppercase tracking-[0.15em] text-primary-foreground shadow-[0_0_24px_-6px_hsl(200,85%,65%,0.7)] transition-all hover:bg-primary/90 hover:shadow-[0_0_30px_-4px_hsl(200,85%,65%,0.9)] active:scale-[0.98]"
          >
            {newsletter.submitLabel || "S'inscrire"}
          </button>
        </form>
      </div>
    </section>
  );
}
