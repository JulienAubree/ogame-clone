import { useMemo } from 'react';

interface Rock {
  x: number;
  y: number;
  size: number;
  rot: number;
  shade: number;
  driftDur: number;
  driftDelay: number;
  seed: number;
  hue: number;
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
      y: 6 + rng() * 18,
      size: 0.8 + rng() * (layer === 0 ? 3.2 : 1.6),
      rot: rng() * 360,
      shade: 0.2 + rng() * 0.8,
      driftDur: 20 + rng() * 30,
      driftDelay: -(rng() * 30),
      seed: Math.floor(rng() * 1000),
      hue: 20 + rng() * 30,
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
    const jitter = 0.55 + rng() * 0.5;
    pts.push(
      `${(Math.cos(angle) * size * jitter).toFixed(2)},${(Math.sin(angle) * size * jitter).toFixed(2)}`,
    );
  }
  return `M${pts.join('L')}Z`;
}

// Pre-compute at module level — no runtime cost
const FRONT_ROCKS = generateRocks(8, 0);
const BACK_ROCKS = generateRocks(14, 1);

// Pre-compute all paths
const ROCK_PATHS = new Map<string, { body: string; highlight: string }>();
for (const rock of [...FRONT_ROCKS, ...BACK_ROCKS]) {
  const key = `${rock.seed}-${rock.size}`;
  if (!ROCK_PATHS.has(key)) {
    ROCK_PATHS.set(key, {
      body: rockPath(rock.size, rock.seed),
      highlight: rockPath(rock.size * 0.4, rock.seed + 1),
    });
  }
}

// Pre-compute dust positions
const DUST_RNG = seededRandom(7);
const DUST = Array.from({ length: 15 }, () => ({
  cx: DUST_RNG() * 200,
  cy: 6 + DUST_RNG() * 18,
  r: 0.3 + DUST_RNG() * 0.5,
  opacity: 0.15 + DUST_RNG() * 0.25,
}));

// Pre-compute sparkle positions
const SPARK_RNG = seededRandom(11);
const SPARKLES = Array.from({ length: 6 }, () => ({
  cx: 8 + SPARK_RNG() * 184,
  cy: 6 + SPARK_RNG() * 18,
  dur: 2 + SPARK_RNG() * 3,
  delay: SPARK_RNG() * 5,
}));

function RockGroup({ rocks, opacity }: { rocks: Rock[]; opacity: number }) {
  return (
    <g opacity={opacity}>
      {rocks.map((rock, i) => {
        const key = `${rock.seed}-${rock.size}`;
        const paths = ROCK_PATHS.get(key)!;
        const lum = 25 + rock.shade * 20;
        const sat = 20 + rock.shade * 30;

        return (
          <g
            key={i}
            transform={`translate(${rock.x},${rock.y}) rotate(${rock.rot})`}
            style={{
              animation: `asteroid-drift ${rock.driftDur}s ease-in-out ${rock.driftDelay}s infinite`,
            }}
          >
            <path
              d={paths.body}
              fill={`hsl(${rock.hue}, ${sat}%, ${lum}%)`}
              stroke={`hsl(${rock.hue - 5}, ${sat + 5}%, ${lum * 0.6}%)`}
              strokeWidth="0.15"
            />
            <path
              d={paths.highlight}
              fill={`hsla(${rock.hue + 10}, 50%, ${55 + rock.shade * 20}%, 0.3)`}
              transform={`translate(${-rock.size * 0.22},${-rock.size * 0.25})`}
            />
          </g>
        );
      })}
    </g>
  );
}

export function AsteroidBelt({ className }: { className?: string }) {
  const uid = useMemo(() => Math.random().toString(36).slice(2, 8), []);

  return (
    <svg
      viewBox="0 0 200 30"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`bg-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f97316" stopOpacity="0" />
          <stop offset="50%" stopColor="#fb923c" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`fe-${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="5%" stopColor="white" stopOpacity="1" />
          <stop offset="95%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={`fm-${uid}`}>
          <rect width="200" height="30" fill={`url(#fe-${uid})`} />
        </mask>
      </defs>

      {/* Ambient glow */}
      <rect
        x="0" y="0" width="200" height="30"
        fill={`url(#bg-${uid})`}
        className="asteroid-glow"
      />

      {/* Rocks */}
      <g mask={`url(#fm-${uid})`}>
        <RockGroup rocks={BACK_ROCKS} opacity={0.35} />
        <RockGroup rocks={FRONT_ROCKS} opacity={1} />
      </g>

      {/* Static dust */}
      <g mask={`url(#fm-${uid})`} opacity="0.3">
        {DUST.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r={d.r} fill="#fdba74" opacity={d.opacity} />
        ))}
      </g>

      {/* Sparkles */}
      {SPARKLES.map((s, i) => (
        <circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r="0.3"
          fill="#fef3c7"
          className="asteroid-sparkle"
          style={{
            animationDuration: `${s.dur}s`,
            animationDelay: `${s.delay}s`,
          }}
        />
      ))}
    </svg>
  );
}
