// Tests for procedural world generation contracts.
//
// Consumer: main.ts (tick) calls getVisiblePanels(px, py, 600) every frame and replaces
// world.panels with the result. The renderer then draws whatever is in world.panels.
//
// Contracts tested here:
//   - Determinism: same chunk coords always produce the same panels (used by caller to
//     rely on consistent world across frames without re-seeding)
//   - No-overlap: panels within a chunk never intersect including the 10-unit gap
//   - Bounds: every panel stays within its chunk footprint
//   - Panel shape: z is 1 or 2, w/h are in [60, 200], RGBA alpha is 0.8
//   - Chunk lifecycle: chunks outside the radius are evicted from the cache after the
//     next call (the caller never sees stale panels from evicted chunks)
//   - Color/border parity: each panel's color and border come from the same palette index

import { describe, it, expect, beforeEach } from 'vitest';

// --- Re-export the internal functions for testing by re-implementing them here.
// generate.ts does not export its internal helpers, so we test through the public API
// (getVisiblePanels) and a small extracted copy of the hash/overlap logic for invariant checks.

import { getVisiblePanels } from '../../world/generate';
import type { Panel } from '../../world/types';

// ── Determinism ────────────────────────────────────────────────────────────────

describe('getVisiblePanels() determinism', () => {
  it('returns panels with identical positions on repeated calls at the same location', () => {
    const first = getVisiblePanels(0, 0, 50);
    const second = getVisiblePanels(0, 0, 50);
    expect(first.length).toBe(second.length);
    for (let i = 0; i < first.length; i++) {
      expect(first[i].position).toEqual(second[i].position);
      expect(first[i].size).toEqual(second[i].size);
    }
  });

  it('returns the same panels after traveling away and returning', () => {
    // Capture panels at origin, move far away so origin chunks are evicted, come back.
    const before = getVisiblePanels(0, 0, 50).map(p => ({ ...p }));
    // Move far enough that origin is outside radius (CHUNK_SIZE=400, so 2000 is safe)
    getVisiblePanels(2000, 2000, 50);
    const after = getVisiblePanels(0, 0, 50);
    expect(after.length).toBe(before.length);
    for (let i = 0; i < before.length; i++) {
      expect(after[i].position).toEqual(before[i].position);
    }
  });

  it('produces different panels for different chunk coordinates', () => {
    // Two positions guaranteed to resolve to different chunks (CHUNK_SIZE=400)
    const chunkA = getVisiblePanels(0, 0, 50);
    const chunkB = getVisiblePanels(600, 0, 50);
    // The sets of panel positions must not be identical
    const posA = chunkA.map(p => p.position.join(','));
    const posB = chunkB.map(p => p.position.join(','));
    expect(posA).not.toEqual(posB);
  });
});

// ── No-overlap within a chunk ──────────────────────────────────────────────────

// Mirrors the production overlap check (GAP=10) so we can verify the guarantee
// independently of the implementation.
const GAP = 10;
function overlapsWithGap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
): boolean {
  return x1 - GAP < x2 + w2 && x1 + w1 + GAP > x2 &&
         y1 - GAP < y2 + h2 && y1 + h1 + GAP > y2;
}

describe('panels within each chunk', () => {
  // Sample a range of chunk origins to get good coverage.
  const testPositions: [number, number][] = [
    [0, 0], [400, 0], [0, 400], [-400, 0], [0, -400],
    [800, 800], [-800, -800], [1200, 400],
  ];

  for (const [px, py] of testPositions) {
    it(`panels at chunk (${px}, ${py}) do not overlap including the minimum gap`, () => {
      // Use a small radius so we get exactly the chunk under px,py and its immediate neighbors,
      // but check pairs within each chunk by isolating a single chunk's worth of position space.
      const panels = getVisiblePanels(px, py, 50); // radius < CHUNK_SIZE/2 → usually 1 chunk
      for (let i = 0; i < panels.length; i++) {
        for (let j = i + 1; j < panels.length; j++) {
          const a = panels[i];
          const b = panels[j];
          const overlaps = overlapsWithGap(
            a.position[0], a.position[1], a.size[0], a.size[1],
            b.position[0], b.position[1], b.size[0], b.size[1],
          );
          expect(overlaps).toBe(false);
        }
      }
    });
  }
});

// ── Panel bounds within chunk footprint ───────────────────────────────────────

describe('panel positions stay within their chunk footprint', () => {
  const CHUNK_SIZE = 400;

  it('panels at origin are within chunk (0,0) footprint [0, 400) x [0, 400)', () => {
    const panels = getVisiblePanels(200, 200, 50);
    for (const p of panels) {
      const [x, y] = p.position;
      const [w, h] = p.size;
      // panel may span negative chunk origin because it's placed at baseX + offset*(CHUNK_SIZE-w)
      // It must start at or after baseX and end at or before baseX+CHUNK_SIZE
      const chunkX = Math.floor(x / CHUNK_SIZE) * CHUNK_SIZE;
      const chunkY = Math.floor(y / CHUNK_SIZE) * CHUNK_SIZE;
      expect(x).toBeGreaterThanOrEqual(chunkX);
      expect(x + w).toBeLessThanOrEqual(chunkX + CHUNK_SIZE);
      expect(y).toBeGreaterThanOrEqual(chunkY);
      expect(y + h).toBeLessThanOrEqual(chunkY + CHUNK_SIZE);
    }
  });
});

// ── Panel shape invariants ─────────────────────────────────────────────────────

describe('panel shape invariants', () => {
  let panels: Panel[];

  beforeEach(() => {
    panels = getVisiblePanels(0, 0, 200); // get a decent sample across multiple chunks
  });

  it('z is 1 or 2 for all panels', () => {
    for (const p of panels) {
      expect([1, 2]).toContain(p.position[2]);
    }
  });

  it('width and height are in [60, 200]', () => {
    for (const p of panels) {
      expect(p.size[0]).toBeGreaterThanOrEqual(60);
      expect(p.size[0]).toBeLessThanOrEqual(200);
      expect(p.size[1]).toBeGreaterThanOrEqual(60);
      expect(p.size[1]).toBeLessThanOrEqual(200);
    }
  });

  it('color and border alpha are 0.8', () => {
    for (const p of panels) {
      expect(p.color[3]).toBeCloseTo(0.8);
      expect(p.border[3]).toBeCloseTo(0.8);
    }
  });

  it('color and border are from the same palette entry (same index)', () => {
    // The palette pairs are fixed: color[i] and border[i] are always used together.
    // We verify this by checking that known palette values appear in matching pairs.
    const COLORS = [
      [0.82, 0.85, 0.90],
      [0.85, 0.82, 0.88],
      [0.80, 0.87, 0.86],
      [0.88, 0.84, 0.80],
    ];
    const BORDERS = [
      [0.60, 0.63, 0.70],
      [0.65, 0.60, 0.68],
      [0.58, 0.67, 0.66],
      [0.68, 0.64, 0.60],
    ];
    for (const p of panels) {
      let colorIdx = -1;
      for (let i = 0; i < COLORS.length; i++) {
        if (
          Math.abs(p.color[0] - COLORS[i][0]) < 0.001 &&
          Math.abs(p.color[1] - COLORS[i][1]) < 0.001 &&
          Math.abs(p.color[2] - COLORS[i][2]) < 0.001
        ) {
          colorIdx = i;
          break;
        }
      }
      expect(colorIdx).not.toBe(-1); // color must be from the palette
      expect(p.border[0]).toBeCloseTo(BORDERS[colorIdx][0]);
      expect(p.border[1]).toBeCloseTo(BORDERS[colorIdx][1]);
      expect(p.border[2]).toBeCloseTo(BORDERS[colorIdx][2]);
    }
  });

  // children/parent fields removed from Panel type — no longer relevant
});

// ── Chunk eviction ─────────────────────────────────────────────────────────────

describe('getVisiblePanels() chunk eviction', () => {
  it('panels from a far-away position are not included in a local query', () => {
    // Load chunk at (2000, 2000)
    const farPanels = getVisiblePanels(2000, 2000, 50);
    expect(farPanels.length).toBeGreaterThan(0); // sanity: something was generated

    // Now query near origin — far chunk should be evicted
    const nearPanels = getVisiblePanels(0, 0, 50);

    // None of the near panels should have positions near (2000, 2000)
    for (const p of nearPanels) {
      expect(p.position[0]).toBeLessThan(1000);
      expect(p.position[1]).toBeLessThan(1000);
    }
  });

  it('only returns panels whose chunk is within the requested radius', () => {
    // With radius 50, only the chunk(s) immediately around px,py should be loaded.
    // CHUNK_SIZE=400, so the player at (200, 200) is in chunk (0,0).
    // radius 50 means cxMin = floor(150/400)=0, cxMax = floor(250/400)=0: exactly one chunk.
    const panels = getVisiblePanels(200, 200, 50);
    for (const p of panels) {
      expect(p.position[0]).toBeGreaterThanOrEqual(0);
      expect(p.position[0]).toBeLessThan(400);
      expect(p.position[1]).toBeGreaterThanOrEqual(0);
      expect(p.position[1]).toBeLessThan(400);
    }
  });
});
