import { Link } from 'react-router';
import { ExiliumLogo } from './ExiliumLogo';
import type { HomepageContent } from './useHomepageContent';

interface LandingFooterProps {
  content: HomepageContent;
}

type Social = HomepageContent['footer']['socials'][number];
type FooterSection = HomepageContent['footer']['sections'][number];
type FooterLink = FooterSection['links'][number];

export function LandingFooter({ content }: LandingFooterProps) {
  const { footer } = content;

  return (
    <footer className="border-t border-white/5 bg-background">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-16 lg:px-10">
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          {/* Brand column */}
          <div className="lg:col-span-4">
            <ExiliumLogo className="h-6" />
            {footer.description && (
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
                {footer.description}
              </p>
            )}
            {footer.socials.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {footer.socials.map((s: Social) => (
                  <SocialLink key={s.platform + s.href} platform={s.platform} href={s.href} />
                ))}
              </div>
            )}
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 lg:col-span-8 lg:gap-10">
            {footer.sections.map((section: FooterSection) => (
              <div key={section.title}>
                <h3 className="mb-4 text-xs font-bold uppercase tracking-[0.25em] text-foreground">
                  {section.title}
                </h3>
                <ul className="space-y-3">
                  {section.links.map((link: FooterLink) => (
                    <li key={link.href + link.label}>
                      <FooterLink href={link.href}>{link.label}</FooterLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {(footer.legalNote || footer.description) && (
          <div className="mt-12 border-t border-white/5 pt-6 text-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground/70">
            {footer.legalNote}
          </div>
        )}
      </div>
    </footer>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  const isInternal = href.startsWith('/');
  const className = 'text-sm text-muted-foreground transition-colors hover:text-primary';
  if (isInternal) {
    return (
      <Link to={href} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function SocialLink({ platform, href }: { platform: Social['platform']; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={platform}
      className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-card/40 text-muted-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
    >
      <SocialIcon platform={platform} />
    </a>
  );
}

function SocialIcon({ platform }: { platform: Social['platform'] }) {
  // Lightweight inline SVGs — keeps the footer free of icon-pack imports
  // and lets us keep them visually consistent with the rest of the landing.
  const props = { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'currentColor' } as const;
  switch (platform) {
    case 'discord':
      return (
        <svg {...props} aria-hidden>
          <path d="M19.27 5.33A18.5 18.5 0 0 0 14.6 4l-.23.46a17 17 0 0 0-4.74 0L9.4 4a18.5 18.5 0 0 0-4.67 1.33C2.27 9.13 1.59 12.85 1.94 16.5a18.7 18.7 0 0 0 5.69 2.86l.46-.74a12 12 0 0 1-1.81-.87l.45-.34a13 13 0 0 0 11.54 0l.45.34a12 12 0 0 1-1.82.87l.46.74a18.7 18.7 0 0 0 5.7-2.86c.4-4.18-.5-7.86-3.08-11.17ZM8.52 14.45c-1.12 0-2.04-1-2.04-2.22s.9-2.23 2.04-2.23 2.06 1.01 2.04 2.23c0 1.21-.9 2.22-2.04 2.22Zm6.96 0c-1.13 0-2.04-1-2.04-2.22s.9-2.23 2.04-2.23 2.05 1.01 2.04 2.23c0 1.21-.9 2.22-2.04 2.22Z" />
        </svg>
      );
    case 'twitter':
      return (
        <svg {...props} aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
        </svg>
      );
    case 'youtube':
      return (
        <svg {...props} aria-hidden>
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.6 3.6 12 3.6 12 3.6s-7.6 0-9.4.5A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.8.5 9.4.5 9.4.5s7.6 0 9.4-.5a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4l6.4 3.6-6.4 3.6Z" />
        </svg>
      );
    case 'facebook':
      return (
        <svg {...props} aria-hidden>
          <path d="M24 12a12 12 0 1 0-13.88 11.85V15.47H7.08V12h3.04V9.36c0-3 1.79-4.66 4.53-4.66 1.31 0 2.69.23 2.69.23v2.95h-1.51c-1.49 0-1.96.93-1.96 1.88V12h3.33l-.53 3.47h-2.8v8.38A12 12 0 0 0 24 12Z" />
        </svg>
      );
    case 'instagram':
      return (
        <svg {...props} aria-hidden>
          <path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.23.41.56.22.96.48 1.38.9.42.42.68.82.9 1.38.16.42.36 1.06.4 2.22.07 1.27.08 1.65.08 4.86 0 3.2-.01 3.58-.07 4.85-.05 1.17-.25 1.8-.41 2.23-.22.56-.48.96-.9 1.38-.42.42-.82.68-1.38.9-.42.16-1.06.36-2.22.4-1.27.07-1.65.08-4.86.08-3.2 0-3.58-.01-4.85-.07-1.17-.05-1.8-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.9 3.7 3.7 0 0 1-.9-1.38c-.16-.42-.36-1.06-.4-2.22-.07-1.27-.08-1.65-.08-4.86 0-3.2.01-3.58.07-4.85.05-1.17.25-1.8.41-2.23.22-.56.48-.96.9-1.38.42-.42.82-.68 1.38-.9.42-.16 1.06-.36 2.22-.4C8.42 2.17 8.8 2.16 12 2.16ZM12 0C8.74 0 8.33.01 7.05.07 5.78.13 4.9.34 4.14.63a5.84 5.84 0 0 0-2.13 1.38A5.85 5.85 0 0 0 .63 4.14C.34 4.9.13 5.78.07 7.05.01 8.33 0 8.74 0 12s.01 3.67.07 4.95c.06 1.27.27 2.15.56 2.91.31.79.72 1.46 1.38 2.13.67.66 1.34 1.07 2.13 1.38.76.29 1.64.5 2.91.56C8.33 23.99 8.74 24 12 24s3.67-.01 4.95-.07c1.27-.06 2.15-.27 2.91-.56a5.84 5.84 0 0 0 2.13-1.38 5.85 5.85 0 0 0 1.38-2.13c.29-.76.5-1.64.56-2.91.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95c-.06-1.27-.27-2.15-.56-2.91a5.84 5.84 0 0 0-1.38-2.13A5.85 5.85 0 0 0 19.86.63C19.1.34 18.22.13 16.95.07 15.67.01 15.26 0 12 0Zm0 5.84a6.16 6.16 0 1 0 0 12.32 6.16 6.16 0 0 0 0-12.32ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.4-11.85a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88Z" />
        </svg>
      );
    case 'twitch':
      return (
        <svg {...props} aria-hidden>
          <path d="M2.55 0 1 4.55v17.7h6V24h3.45L13.9 22.25h5.05L24 17.2V0H2.55Zm2.05 1.85h17.4v14.4l-3.5 3.5h-5.7l-2.95 2.95V19.75h-5.25V1.85Zm6.05 12.9h2.05V8.85h-2.05v5.9Zm5.65 0h2.05V8.85h-2.05v5.9Z" />
        </svg>
      );
    case 'github':
      return (
        <svg {...props} aria-hidden>
          <path d="M12 .5a12 12 0 0 0-3.79 23.4c.6.1.82-.26.82-.58v-2.2c-3.34.72-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.08 1.85 1.24 1.85 1.24 1.07 1.83 2.81 1.3 3.5.99.1-.78.42-1.31.76-1.61-2.67-.31-5.47-1.34-5.47-5.95 0-1.31.47-2.39 1.24-3.23-.13-.31-.54-1.54.12-3.21 0 0 1.01-.32 3.3 1.23a11.4 11.4 0 0 1 6 0c2.29-1.55 3.3-1.23 3.3-1.23.66 1.67.25 2.9.12 3.21.77.84 1.24 1.92 1.24 3.23 0 4.62-2.81 5.63-5.49 5.93.43.37.81 1.1.81 2.21v3.27c0 .32.21.69.83.58A12 12 0 0 0 12 .5Z" />
        </svg>
      );
  }
}
