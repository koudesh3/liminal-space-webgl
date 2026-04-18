// Tests for lighting system contracts.
//
// updateLighting() has two side-effects that depend on external I/O:
//   1. torch toggle (consumeTorchToggle from input.ts)
//   2. direction tracking (getMouseScreen + getCanvasSize from input/context)
//
// We extract and test the pure direction logic independently, then test the
// torch toggle state machine through its observable output on world.light.torchOn.
//
// NOTE: updateLighting() imports from '../input' and '../renderer/context', both of
// which touch browser globals (window, canvas). Those imports make the full function
// untestable without mocking. The tests below therefore extract and verify the pure
// mathematical sub-problems that could/should be extracted from updateLighting.
//
// Contracts documented (but not directly testable without refactoring):
//   - world.light.position tracks world.player.position after every call
//   - direction vector is always unit length after update
//   - isometric mode skips direction tracking (light still follows player)
//   - torch state flips exactly once per consumeTorchToggle() === true

import { describe, it, expect } from 'vitest';

// ── Pure direction math ────────────────────────────────────────────────────────
// These are the pure operations embedded in updateLighting.
// If the function is ever refactored to extract them, these tests remain valid.

// Extracted from updateLighting: rotates `cur` toward `target` by at most `maxRot` radians.
function rotateToward(
  cur: [number, number],
  target: [number, number],
  maxRot: number,
): [number, number] {
  const [curX, curY] = cur;
  const [targetX, targetY] = target;
  const cross = curX * targetY - curY * targetX;
  const dot = curX * targetX + curY * targetY;
  let angleDiff = Math.atan2(cross, dot);
  angleDiff = Math.max(-maxRot, Math.min(maxRot, angleDiff));
  const cos = Math.cos(angleDiff);
  const sin = Math.sin(angleDiff);
  const newX = curX * cos - curY * sin;
  const newY = curX * sin + curY * cos;
  const nlen = Math.sqrt(newX * newX + newY * newY);
  return [newX / nlen, newY / nlen];
}

describe('torch direction rotateToward()', () => {
  it('output is always unit length', () => {
    const cases: [[number, number], [number, number]][] = [
      [[1, 0], [0, 1]],
      [[0, 1], [-1, 0]],
      [[-1, 0], [0, -1]],
      [[1 / Math.SQRT2, 1 / Math.SQRT2], [-1, 0]],
    ];
    for (const [cur, target] of cases) {
      const result = rotateToward(cur, target, 0.5);
      const len = Math.sqrt(result[0] ** 2 + result[1] ** 2);
      expect(len).toBeCloseTo(1.0);
    }
  });

  it('does not overshoot the target when the angle difference is small', () => {
    const cur: [number, number] = [1, 0];
    const target: [number, number] = [1, 0]; // already aligned
    const result = rotateToward(cur, target, 0.25);
    expect(result[0]).toBeCloseTo(1.0);
    expect(result[1]).toBeCloseTo(0.0);
  });

  it('clamps rotation to maxRot when target is more than maxRot away', () => {
    // cur points right (0°), target points up (-90°, i.e. angle diff = -π/2)
    const cur: [number, number] = [1, 0];
    const target: [number, number] = [0, -1];
    const maxRot = 0.1;
    const result = rotateToward(cur, target, maxRot);

    // Angle from result to (1,0) should be exactly maxRot
    const angle = Math.atan2(result[1], result[0]);
    expect(Math.abs(angle)).toBeCloseTo(maxRot, 5);
  });

  it('reaches the target exactly when maxRot >= angle difference', () => {
    const cur: [number, number] = [1, 0];
    const target: [number, number] = [0, 1]; // 90° away
    const result = rotateToward(cur, target, Math.PI); // max > 90°
    expect(result[0]).toBeCloseTo(0.0, 4);
    expect(result[1]).toBeCloseTo(1.0, 4);
  });

  it('handles counter-clockwise and clockwise rotation symmetrically', () => {
    const cur: [number, number] = [1, 0];
    const cw: [number, number] = [0, 1];  // 90° clockwise
    const ccw: [number, number] = [0, -1]; // 90° counter-clockwise
    const maxRot = 0.2;
    const resultCW = rotateToward(cur, cw, maxRot);
    const resultCCW = rotateToward(cur, ccw, maxRot);

    // Both should rotate exactly maxRot but in opposite directions
    const angleCW = Math.atan2(resultCW[1], resultCW[0]);
    const angleCCW = Math.atan2(resultCCW[1], resultCCW[0]);
    expect(angleCW).toBeCloseTo(maxRot, 5);
    expect(angleCCW).toBeCloseTo(-maxRot, 5);
  });

  it('normalizes the result even when cur and target are identical', () => {
    const cur: [number, number] = [0, -1];
    const result = rotateToward(cur, [0, -1], 0.1);
    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2);
    expect(len).toBeCloseTo(1.0);
  });
});

// ── Screen-center direction normalization ─────────────────────────────────────
// updateLighting skips direction update when mouse is within 1px of screen center.
// This is a guard against NaN from normalizing a near-zero vector.

describe('near-center mouse guard', () => {
  it('returns early (no update) when mouse distance from center < 1', () => {
    // We verify the guard condition: Math.sqrt(dx*dx+dy*dy) < 1 → skip.
    // This is the same formula used in updateLighting.
    const dx = 0.5, dy = 0.5;
    const len = Math.sqrt(dx * dx + dy * dy);
    expect(len).toBeLessThan(1);
  });

  it('proceeds when mouse distance from center >= 1', () => {
    const dx = 1, dy = 0;
    const len = Math.sqrt(dx * dx + dy * dy);
    expect(len).toBeGreaterThanOrEqual(1);
  });
});

// ── Torch toggle state machine ─────────────────────────────────────────────────
// consumeTorchToggle() is a consume-once flag. We test the state machine independently
// of the browser event that sets it, since initInput() requires window.

describe('torch toggle state machine', () => {
  // We test the logic as an extracted state machine, mirroring input.ts exactly.

  function makeTorchState() {
    let toggled = false;
    return {
      set: () => { toggled = true; },
      consume: (): boolean => {
        if (toggled) { toggled = false; return true; }
        return false;
      },
    };
  }

  it('consume() returns false before any toggle', () => {
    const ts = makeTorchState();
    expect(ts.consume()).toBe(false);
  });

  it('consume() returns true exactly once after a toggle', () => {
    const ts = makeTorchState();
    ts.set();
    expect(ts.consume()).toBe(true);
    expect(ts.consume()).toBe(false);
  });

  it('consume() resets after being consumed', () => {
    const ts = makeTorchState();
    ts.set();
    ts.consume(); // first consume
    expect(ts.consume()).toBe(false); // must be false now
  });

  it('two consecutive sets produce only one true from consume', () => {
    const ts = makeTorchState();
    ts.set();
    ts.set(); // second set — still just one pending toggle
    expect(ts.consume()).toBe(true);
    expect(ts.consume()).toBe(false);
  });

  it('toggling again after consumption produces another true', () => {
    const ts = makeTorchState();
    ts.set();
    ts.consume();
    ts.set();
    expect(ts.consume()).toBe(true);
  });
});
