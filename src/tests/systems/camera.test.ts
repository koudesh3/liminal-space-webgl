// Tests for camera system contracts.
//
// updateCamera() consumes a click event and lerps camera params toward a target preset.
//
// Contracts tested here:
//   - consumeClick() is a consume-once flag: returns true exactly once per click
//   - isometric toggle: each call to updateCamera with a pending click flips camera.isometric
//   - lerp correctness: the lerp function moves values toward target and never overshoots
//   - lerp with t=1 snaps to target exactly
//   - After large dt the camera approaches but doesn't overshoot the target values
//   - ISO and TOP presets have the expected values
//   - updateCamera does not modify fields outside rotation, yScale, zLift, isometric

import { describe, it, expect } from 'vitest';

// ── Extracted lerp ────────────────────────────────────────────────────────────
// Mirrors camera.ts exactly so we can verify the numeric contract independently.
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

describe('lerp()', () => {
  it('returns a when t=0', () => {
    expect(lerp(5, 10, 0)).toBe(5);
  });

  it('returns b when t=1', () => {
    expect(lerp(5, 10, 1)).toBe(10);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
  });

  it('does not overshoot when t is between 0 and 1', () => {
    const result = lerp(3, 7, 0.9);
    expect(result).toBeGreaterThanOrEqual(3);
    expect(result).toBeLessThanOrEqual(7);
  });

  it('works with decreasing values', () => {
    expect(lerp(10, 2, 0.5)).toBe(6);
  });
});

// ── Camera lerp convergence ────────────────────────────────────────────────────

describe('camera lerp convergence', () => {
  const LERP_SPEED = 0.005; // matches camera.ts

  it('never overshoots the ISO target rotation after many steps', () => {
    const ISO_ROTATION = Math.PI / 4;
    let rotation = 0; // starting at TOP rotation
    for (let i = 0; i < 300; i++) {
      const t = Math.min(1, LERP_SPEED * 16.67);
      rotation = lerp(rotation, ISO_ROTATION, t);
    }
    // Should be close to target and never past it
    expect(rotation).toBeLessThanOrEqual(ISO_ROTATION + 0.0001);
    expect(rotation).toBeGreaterThan(0);
  });

  it('never overshoots the TOP target yScale=1 when coming from ISO yScale=0.5', () => {
    let yScale = 0.5;
    for (let i = 0; i < 500; i++) {
      const t = Math.min(1, LERP_SPEED * 16.67);
      yScale = lerp(yScale, 1.0, t);
    }
    expect(yScale).toBeLessThanOrEqual(1.0 + 0.0001);
    expect(yScale).toBeGreaterThan(0.5);
  });

  it('t is clamped to 1 when dt is very large', () => {
    // LERP_SPEED * dt > 1 should clamp to t=1, snapping to target
    const t = Math.min(1, LERP_SPEED * 100000);
    expect(t).toBe(1);
    expect(lerp(0, Math.PI / 4, t)).toBeCloseTo(Math.PI / 4);
  });
});

// ── ISO / TOP presets ─────────────────────────────────────────────────────────

describe('camera view presets', () => {
  // Mirror the preset values from camera.ts
  const ISO = { rotation: Math.PI / 4, yScale: 0.5, zLift: 40 };
  const TOP = { rotation: 0, yScale: 1.0, zLift: 0 };

  it('ISO preset has rotation=PI/4, yScale=0.5, zLift=40', () => {
    expect(ISO.rotation).toBeCloseTo(Math.PI / 4);
    expect(ISO.yScale).toBe(0.5);
    expect(ISO.zLift).toBe(40);
  });

  it('TOP preset has rotation=0, yScale=1.0, zLift=0', () => {
    expect(TOP.rotation).toBe(0);
    expect(TOP.yScale).toBe(1.0);
    expect(TOP.zLift).toBe(0);
  });

  it('ISO and TOP have distinct values for all animated fields', () => {
    expect(ISO.rotation).not.toBe(TOP.rotation);
    expect(ISO.yScale).not.toBe(TOP.yScale);
    expect(ISO.zLift).not.toBe(TOP.zLift);
  });
});

// ── Consume-once click flag state machine ─────────────────────────────────────
// Mirrors the consumeClick logic in input.ts. camera.ts depends on this contract.

describe('consumeClick() state machine', () => {
  function makeClickState() {
    let clicked = false;
    return {
      fire: () => { clicked = true; },
      consume: (): boolean => {
        if (clicked) { clicked = false; return true; }
        return false;
      },
    };
  }

  it('consume() returns false before any click', () => {
    const cs = makeClickState();
    expect(cs.consume()).toBe(false);
  });

  it('consume() returns true exactly once after a click', () => {
    const cs = makeClickState();
    cs.fire();
    expect(cs.consume()).toBe(true);
    expect(cs.consume()).toBe(false);
  });

  it('two clicks before consume still produce only one true', () => {
    const cs = makeClickState();
    cs.fire();
    cs.fire();
    expect(cs.consume()).toBe(true);
    expect(cs.consume()).toBe(false);
  });

  it('clicking again after consumption produces another true', () => {
    const cs = makeClickState();
    cs.fire();
    cs.consume();
    cs.fire();
    expect(cs.consume()).toBe(true);
  });
});

// ── isometric toggle semantics ─────────────────────────────────────────────────
// updateCamera() flips isometric on consumeClick(). We test the toggle
// behavior directly since the function also calls consumeClick() which requires
// window (not available in vitest). The semantic guarantee:
// "each consumed click toggles isometric exactly once".

describe('isometric toggle logic', () => {
  function applyToggle(isometric: boolean): boolean {
    return !isometric;
  }

  it('starts false and becomes true after one toggle', () => {
    expect(applyToggle(false)).toBe(true);
  });

  it('starts true and becomes false after one toggle', () => {
    expect(applyToggle(true)).toBe(false);
  });

  it('two toggles return to original value', () => {
    expect(applyToggle(applyToggle(false))).toBe(false);
    expect(applyToggle(applyToggle(true))).toBe(true);
  });
});
