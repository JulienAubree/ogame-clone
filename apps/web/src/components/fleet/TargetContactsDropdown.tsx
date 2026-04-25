import { useState, useRef, useEffect, useMemo } from 'react';
import { BookUser } from 'lucide-react';
import { trpc } from '@/trpc';
import { cn } from '@/lib/utils';

interface Props {
  onSelect: (coords: { galaxy: number; system: number; position: number }) => void;
  disabled?: boolean;
}

const fmtCoords = (g: number, s: number, p: number) => `[${g}:${s}:${p}]`;

export function TargetContactsDropdown({ onSelect, disabled }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data } = trpc.fleet.contacts.useQuery(undefined, {
    enabled: isOpen,
    staleTime: 60_000,
  });

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  // Auto-focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
    }
  }, [isOpen]);

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    if (!data) return null;

    const myPlanets = data.myPlanets.filter(
      (p) => !q || p.name.toLowerCase().includes(q),
    );

    const friends = data.friends
      .map((f) => ({
        ...f,
        planets: f.planets.filter(
          (p) => !q || f.username.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        ),
      }))
      .filter((f) => f.planets.length > 0);

    const allianceMembers = data.allianceMembers
      .map((m) => ({
        ...m,
        planets: m.planets.filter(
          (p) => !q || m.username.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
        ),
      }))
      .filter((m) => m.planets.length > 0);

    const total = myPlanets.length
      + friends.reduce((s, f) => s + f.planets.length, 0)
      + allianceMembers.reduce((s, m) => s + m.planets.length, 0);

    return { myPlanets, friends, allianceMembers, allianceTag: data.allianceTag, total };
  }, [data, q]);

  function handleSelect(galaxy: number, system: number, position: number) {
    onSelect({ galaxy, system, position });
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        disabled={disabled}
        title="Contacts"
        className={cn(
          'flex items-center justify-center rounded-lg border border-border bg-card/60 px-2.5 py-2 text-muted-foreground transition-colors',
          'hover:bg-primary/10 hover:text-primary hover:border-primary/40',
          'focus:outline-none focus:ring-1 focus:ring-ring',
          disabled && 'opacity-50 cursor-not-allowed',
        )}
      >
        <BookUser className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-border bg-card shadow-xl">
          {/* Search bar */}
          <div className="border-b border-border p-2">
            <input
              ref={searchRef}
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {!filtered ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Chargement...</div>
            ) : filtered.total === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Aucun résultat</div>
            ) : (
              <>
                {/* My planets */}
                {filtered.myPlanets.length > 0 && (
                  <div>
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                      Mes planètes
                    </div>
                    {filtered.myPlanets.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelect(p.galaxy, p.system, p.position)}
                        className="flex w-full items-center justify-between px-3 py-2 text-xs hover:bg-primary/10 transition-colors"
                      >
                        <span className="text-foreground truncate">{p.name}</span>
                        <span className="text-muted-foreground font-mono text-[11px]">{fmtCoords(p.galaxy, p.system, p.position)}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Friends */}
                {filtered.friends.length > 0 && (
                  <div>
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                      Amis
                    </div>
                    {filtered.friends.map((f) => (
                      <div key={f.userId}>
                        <div className="px-3 py-1 text-[11px] font-medium text-blue-300">{f.username}</div>
                        {f.planets.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(p.galaxy, p.system, p.position)}
                            className="flex w-full items-center justify-between px-3 py-2 pl-6 text-xs hover:bg-primary/10 transition-colors"
                          >
                            <span className="text-foreground/80 truncate">{p.name}</span>
                            <span className="text-muted-foreground font-mono text-[11px]">{fmtCoords(p.galaxy, p.system, p.position)}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Alliance members */}
                {filtered.allianceMembers.length > 0 && (
                  <div>
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                      Alliance{filtered.allianceTag ? ` [${filtered.allianceTag}]` : ''}
                    </div>
                    {filtered.allianceMembers.map((m) => (
                      <div key={m.userId}>
                        <div className="px-3 py-1 text-[11px] font-medium text-amber-300">
                          {m.username}
                          <span className="ml-1.5 text-[9px] text-amber-500/70 uppercase">{m.role}</span>
                        </div>
                        {m.planets.map((p, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => handleSelect(p.galaxy, p.system, p.position)}
                            className="flex w-full items-center justify-between px-3 py-2 pl-6 text-xs hover:bg-primary/10 transition-colors"
                          >
                            <span className="text-foreground/80 truncate">{p.name}</span>
                            <span className="text-muted-foreground font-mono text-[11px]">{fmtCoords(p.galaxy, p.system, p.position)}</span>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty states (no search active) */}
                {!q && data && data.friends.length === 0 && (
                  <div>
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-blue-400">
                      Amis
                    </div>
                    <div className="px-3 py-3 text-xs text-muted-foreground/60 italic">Aucun ami ajouté</div>
                  </div>
                )}
                {!q && data && !data.allianceTag && (
                  <div>
                    <div className="sticky top-0 bg-muted/80 backdrop-blur-sm px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                      Alliance
                    </div>
                    <div className="px-3 py-3 text-xs text-muted-foreground/60 italic">Pas d'alliance</div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
