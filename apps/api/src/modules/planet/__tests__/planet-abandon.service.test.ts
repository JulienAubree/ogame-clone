import { describe, it, expect } from 'vitest';
import { computeCargoLoad } from '../planet-abandon.service.js';

describe('computeCargoLoad', () => {
  it('loads minerai then silicium then hydrogene up to capacity', () => {
    const res = computeCargoLoad(
      { minerai: 500, silicium: 300, hydrogene: 200 },
      1000,
    );
    expect(res.loaded).toEqual({ minerai: 500, silicium: 300, hydrogene: 200 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
  });

  it('fills minerai first, overflow goes to debris for minerai+silicium', () => {
    const res = computeCargoLoad(
      { minerai: 2000, silicium: 1000, hydrogene: 500 },
      1500,
    );
    expect(res.loaded).toEqual({ minerai: 1500, silicium: 0, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 500, silicium: 1000, hydrogene: 500 });
  });

  it('fills minerai fully then partial silicium', () => {
    const res = computeCargoLoad(
      { minerai: 400, silicium: 800, hydrogene: 300 },
      1000,
    );
    expect(res.loaded).toEqual({ minerai: 400, silicium: 600, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 200, hydrogene: 300 });
  });

  it('returns zero everywhere if capacity is 0', () => {
    const res = computeCargoLoad({ minerai: 100, silicium: 100, hydrogene: 100 }, 0);
    expect(res.loaded).toEqual({ minerai: 0, silicium: 0, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 100, silicium: 100, hydrogene: 100 });
  });

  it('floors fractional capacities toward loaded (keeps loaded never > stock)', () => {
    const res = computeCargoLoad({ minerai: 10, silicium: 10, hydrogene: 10 }, 15);
    expect(res.loaded).toEqual({ minerai: 10, silicium: 5, hydrogene: 0 });
    expect(res.overflow).toEqual({ minerai: 0, silicium: 5, hydrogene: 10 });
  });
});

import { detectBlockers, type AbandonContext } from '../planet-abandon.service.js';

describe('detectBlockers', () => {
  const baseCtx: AbandonContext = {
    planet: { id: 'p1', userId: 'u1', status: 'active', planetClassId: 'rocky' } as any,
    destinationPlanet: { id: 'p2', userId: 'u1', status: 'active' } as any,
    inboundHostile: 0,
    outboundActive: 0,
    activeMarketOffers: 0,
  };

  it('returns empty list when everything is fine', () => {
    expect(detectBlockers(baseCtx)).toEqual([]);
  });

  it('blocks homeworld', () => {
    const ctx = { ...baseCtx, planet: { ...baseCtx.planet, planetClassId: 'homeworld' } as any };
    expect(detectBlockers(ctx)).toContain('homeworld');
  });

  it('blocks colonizing planet', () => {
    const ctx = { ...baseCtx, planet: { ...baseCtx.planet, status: 'colonizing' } as any };
    expect(detectBlockers(ctx)).toContain('colonizing');
  });

  it('blocks on inbound hostile fleets', () => {
    const ctx = { ...baseCtx, inboundHostile: 1 };
    expect(detectBlockers(ctx)).toContain('inbound_hostile');
  });

  it('blocks on inbound colonization_raid fleet (hostile mission)', () => {
    // colonization_raid is a hostile mission (spec §Blocages, line 33) and must
    // be counted by the DB query filter — inboundHostile > 0 triggers the blocker.
    const ctx = { ...baseCtx, inboundHostile: 1 };
    expect(detectBlockers(ctx)).toContain('inbound_hostile');
  });

  it('blocks on outbound active fleets', () => {
    const ctx = { ...baseCtx, outboundActive: 2 };
    expect(detectBlockers(ctx)).toContain('outbound_active');
  });

  it('blocks on active market offers', () => {
    const ctx = { ...baseCtx, activeMarketOffers: 1 };
    expect(detectBlockers(ctx)).toContain('market_offers');
  });

  it('blocks if destination is the abandoned planet itself', () => {
    const ctx = { ...baseCtx, destinationPlanet: baseCtx.planet };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });

  it('blocks if destination is not active', () => {
    const ctx = { ...baseCtx, destinationPlanet: { ...baseCtx.destinationPlanet, status: 'colonizing' } as any };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });

  it('blocks if destination belongs to another user', () => {
    const ctx = { ...baseCtx, destinationPlanet: { ...baseCtx.destinationPlanet, userId: 'other' } as any };
    expect(detectBlockers(ctx)).toContain('destination_invalid');
  });
});
