import { useMemo } from 'react';

interface Rock {
  x: number;
  y: number;
  size: number;
  rot: number;
  shade: number;
  speed: number;
  seed: number;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return s / 2147483647;
  };
}

function generateRocks(count: number, layer: number): Rock[] {
  const rng = seededRandom(42 + layer * 137);
  const rocks: Rock[] = [];
  for (let i = 0; i < count; i++) {
    rocks.push({
      x: rng() * 200,
      y: 4 + rng() * 12,
      size: 0.6 + rng() * (layer === 0 ? 2.8 : 1.4),
      rot: rng() * 360,
      shade: 0.3 + rng() * 0.7,
      speed: 12 + rng() * 24,
      seed: Math.floor(rng() * 1000),
    });
  }
  return rocks;
}

function rockPath(size: number, seed: number): string {
  const n = 7;
  const pts: string[] = [];
  const rng = seededRandom(seed);
  for (let i = 0; i < n; i++) {
    const angle = (Math.PI * 2 * i) / n;
    const jitter = 0.6 + rng() * 0.5;
    const px = Math.cos(angle) * size * jitter;
    const py = Math.sin(angle) * size * jitter;
    pts.push(`${px.toFixed(2)},${py.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const LAYERS = [
  { rocks: generateRocks(14, 0), opacity: 0.85 },
  { rocks: generateRocks(20, 1), opacity: 0.45 },
];

export function AsteroidBelt({ className }: { className?: string }) {
  const uid = useMemo(
    () => Math.random().toString(36).slice(2, 8),
    [],
  );

  return (
    <svg
      viewBox="0 0 200 20"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bf-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
          <stop offset="40%" stopColor="#f97316" stopOpacity="0.07" />
          <stop offset="50%" stopColor="#fb923c" stopOpacity="0.12" />
          <stop offset="60%" stopColor="#f97316" stopOpacity="0.07" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`fe-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="6%" stopColor="white" stopOpacity="1" />
          <stop offset="94%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`fm-${uid}`}>
          <rect width="200" height="20" fill={`url(#fe-${uid})`} />
        </mask>

        <filter id={`gl-${uid}`}>
          <feGaussianBlur stdDeviation="0.4" />
        </filter>
      </defs>

      {/* Ambient glow band */}
      <rect x="0" y="0" width="200" height="20" fill={`url(#bf-${uid})`} />

      {/* Dust lane — blurred tiny dots */}
      <g mask={`url(#fm-${uid})`} filter={`url(#gl-${uid})`} opacity="0.35">
        {Array.from({ length: 30 }, (_, i) => {
          const rng = seededRandom(i * 31 + 7);
          const cx = rng() * 200;
          const cy = 5 + rng() * 10;
          const r = 0.3 + rng() * 0.5;
          return (
            <circle key={`d${i}`} cx={cx} cy={cy} r={r} fill="#fdba74" opacity={0.3 + rng() * 0.5}>
              <animateTransform
                attributeName="transform"
                type="translate"
                values={`0,0; ${2 + rng() * 3},${-0.5 + rng()}; 0,0`}
                dur={`${6 + rng() * 8}s`}
                repeatCount="indefinite"
              />
            </circle>
          );
        })}
      </g>

      {/* Rock layers */}
      <g mask={`url(#fm-${uid})`}>
        {LAYERS.map((layer, li) =>
          layer.rocks.map((rock, ri) => {
            const lum = Math.round(90 + rock.shade * 70);
            const fill = `hsl(30, ${20 + rock.shade * 25}%, ${lum * 0.35}%)`;
            const edge = `hsl(35, ${15 + rock.shade * 20}%, ${lum * 0.22}%)`;
            const highlight = `hsla(40, 60%, 75%, ${0.15 + rock.shade * 0.2})`;

            return (
              <g key={`${li}-${ri}`} opacity={layer.opacity}>
                <g>
                  <animateTransform
                    attributeName="transform"
                    type="translate"
                    values={`${rock.x},${rock.y}; ${rock.x + 1.5},${rock.y - 0.6}; ${rock.x - 0.5},${rock.y + 0.4}; ${rock.x},${rock.y}`}
                    dur={`${rock.speed}s`}
                    repeatCount="indefinite"
                  />
                  <g transform={`rotate(${rock.rot})`}>
                    <animateTransform
                      attributeName="transform"
                      type="rotate"
                      from={`${rock.rot}`}
                      to={`${rock.rot + (ri % 2 === 0 ? 360 : -360)}`}
                      dur={`${40 + rock.speed * 2}s`}
                      repeatCount="indefinite"
                    />
                    {/* Shadow */}
                    <path
                      d={rockPath(rock.size * 1.15, rock.seed)}
                      fill="black"
                      opacity="0.3"
                      transform="translate(0.3,0.4)"
                    />
                    {/* Body */}
                    <path d={rockPath(rock.size, rock.seed)} fill={fill} stroke={edge} strokeWidth="0.2" />
                    {/* Highlight */}
                    <path
                      d={rockPath(rock.size * 0.5, rock.seed + 1)}
                      fill={highlight}
                      transform={`translate(${-rock.size * 0.2},${-rock.size * 0.25})`}
                    />
                  </g>
                </g>
              </g>
            );
          }),
        )}
      </g>

      {/* Sparkle particles */}
      {Array.from({ length: 8 }, (_, i) => {
        const rng = seededRandom(i * 53 + 11);
        const cx = 10 + rng() * 180;
        const cy = 4 + rng() * 12;
        return (
          <circle key={`s${i}`} cx={cx} cy={cy} r="0.25" fill="#fef3c7" opacity="0">
            <animate
              attributeName="opacity"
              values="0;0.8;0"
              dur={`${2 + rng() * 3}s`}
              begin={`${rng() * 4}s`}
              repeatCount="indefinite"
            />
          </circle>
        );
      })}
    </svg>
  );
}
