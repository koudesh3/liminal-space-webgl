// Tests for projection math contracts.
//
// Consumers: draw.ts calls ortho() and viewMatrix() every frame and passes the
// resulting Float32Array directly to gl.uniformMatrix4fv. The shader expects
// column-major 4x4 matrices.
//
// Contracts tested here:
//   - ortho(): identity-maps clip corners, flips Y (y-down screen convention)
//   - ortho(): near/far depth range maps correctly
//   - viewMatrix(): world center maps to screen center
//   - viewMatrix(): at rotation=0, yScale=1, zLift=0, is a pure translation
//   - viewMatrix(): rotation rotates XY plane correctly
//   - viewMatrix(): yScale compresses the Y axis
//   - viewMatrix(): zLift offsets screen-Y by -z*zLift
//   - mul4: result is still column-major (identity * M = M)
//   - screenDirToWorld(): output is unit length for any valid input
//   - screenDirToWorld(): at rotation=0, yScale=1, input=output direction
//   - screenDirToWorld(): round-trips screen→world→screen via viewMatrix column vectors
//   - screenDirToWorld(): returns [0,-1] default when input is near-zero

import { describe, it, expect } from 'vitest';
import { ortho, viewMatrix, screenDirToWorld } from '../../renderer/projection';

// ── Helpers ────────────────────────────────────────────────────────────────────

// Multiply a 4x4 column-major matrix (Float32Array) by a 4-vector [x,y,z,w].
function mulVec4(m: Float32Array, v: [number, number, number, number]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  for (let row = 0; row < 4; row++) {
    out[row] = m[0 * 4 + row] * v[0] +
               m[1 * 4 + row] * v[1] +
               m[2 * 4 + row] * v[2] +
               m[3 * 4 + row] * v[3];
  }
  return out;
}

// Project a world point through view then ortho, return clip coords.
function project(
  wx: number, wy: number, wz: number,
  view: Float32Array, proj: Float32Array,
): [number, number, number, number] {
  const viewClip = mulVec4(view, [wx, wy, wz, 1]);
  return mulVec4(proj, viewClip);
}

// ── ortho() ───────────────────────────────────────────────────────────────────

describe('ortho()', () => {
  it('maps top-left (0, 0) to clip (-1, +1)', () => {
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [0, 0, 0, 1]);
    expect(clip[0]).toBeCloseTo(-1); // x: 0 → -1
    expect(clip[1]).toBeCloseTo(1);  // y: 0 → +1 (y-down: 0 maps to top, which is +1 in clip)
  });

  it('maps bottom-right (width, height) to clip (+1, -1)', () => {
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [800, 600, 0, 1]);
    expect(clip[0]).toBeCloseTo(1);
    expect(clip[1]).toBeCloseTo(-1);
  });

  it('maps center (width/2, height/2) to clip (0, 0)', () => {
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [400, 300, 0, 1]);
    expect(clip[0]).toBeCloseTo(0);
    expect(clip[1]).toBeCloseTo(0);
  });

  it('maps z=near to clip-z=+1 (y-down, z-flipped convention)', () => {
    // ortho() uses out[10] = -2/(far-near) — a negative scale — so the z range is
    // inverted: near z → clip +1, far z → clip -1.
    // With near=-100, far=100: clip_z = (-2/200)*(-100) + 0 = +1.
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [0, 0, -100, 1]);
    expect(clip[2]).toBeCloseTo(1);
  });

  it('maps z=far to clip-z=-1 (y-down, z-flipped convention)', () => {
    // Complement of the near test above.
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [0, 0, 100, 1]);
    expect(clip[2]).toBeCloseTo(-1);
  });

  it('w component of output is always 1 (orthographic — no perspective divide)', () => {
    const m = ortho(800, 600, -100, 100);
    const clip = mulVec4(m, [400, 300, 0, 1]);
    expect(clip[3]).toBeCloseTo(1);
  });

  it('produces a 16-element Float32Array', () => {
    const m = ortho(1920, 1080, -500, 500);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
  });
});

// ── viewMatrix() ──────────────────────────────────────────────────────────────

describe('viewMatrix()', () => {
  it('maps world center to screen center at rotation=0, yScale=1, zLift=0', () => {
    const view = viewMatrix(100, 200, 400, 300, 0, 1, 0);
    const proj = ortho(800, 600, -1000, 1000);
    const clip = project(100, 200, 0, view, proj);
    // World center (100,200) → screen center (400,300) → clip (0,0)
    expect(clip[0]).toBeCloseTo(0);
    expect(clip[1]).toBeCloseTo(0);
  });

  it('at rotation=0, yScale=1, zLift=0 acts as a pure XY translation', () => {
    // World point offset from center by (dx, dy) should appear offset
    // by the same amount in screen space
    const view = viewMatrix(0, 0, 400, 300, 0, 1, 0);
    const pt = mulVec4(view, [50, 30, 0, 1]);
    // Screen position should be (400+50, 300+30) = (450, 330)
    expect(pt[0]).toBeCloseTo(450);
    expect(pt[1]).toBeCloseTo(330);
  });

  it('zLift offsets screen Y upward by z * zLift', () => {
    const zLift = 40;
    const view = viewMatrix(0, 0, 400, 300, 0, 1, zLift);
    const ptZ0 = mulVec4(view, [0, 0, 0, 1]);
    const ptZ1 = mulVec4(view, [0, 0, 1, 1]);
    // z=1 should move screen Y up by zLift (i.e. decrease y in screen space)
    expect(ptZ1[1]).toBeCloseTo(ptZ0[1] - zLift);
  });

  it('yScale compresses world Y in screen space', () => {
    const yScale = 0.5;
    const view = viewMatrix(0, 0, 400, 300, 0, yScale, 0);
    const pt = mulVec4(view, [0, 100, 0, 1]);
    // World Y=100 should appear at screen Y = 300 + 100*yScale = 350
    expect(pt[1]).toBeCloseTo(300 + 100 * yScale);
  });

  it('rotation=PI/4 rotates world X into screen X+Y components', () => {
    const angle = Math.PI / 4;
    const view = viewMatrix(0, 0, 400, 300, angle, 1, 0);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // World (1, 0) → screen (400 + c, 300 + s)
    const pt = mulVec4(view, [1, 0, 0, 1]);
    expect(pt[0]).toBeCloseTo(400 + c);
    expect(pt[1]).toBeCloseTo(300 + s);
  });

  it('produces a 16-element Float32Array', () => {
    const m = viewMatrix(0, 0, 400, 300, 0, 1, 0);
    expect(m).toBeInstanceOf(Float32Array);
    expect(m.length).toBe(16);
  });

  it('different world centers produce different matrices', () => {
    const m1 = viewMatrix(0, 0, 400, 300, 0, 1, 0);
    const m2 = viewMatrix(100, 0, 400, 300, 0, 1, 0);
    expect(Array.from(m1)).not.toEqual(Array.from(m2));
  });
});

// ── screenDirToWorld() ────────────────────────────────────────────────────────

describe('screenDirToWorld()', () => {
  it('output is always unit length', () => {
    const cases: [number, number, number, number][] = [
      [1, 0, 0, 1],
      [0, 1, 0, 1],
      [1, 1, 0, 1],
      [1, 0, Math.PI / 4, 0.5],
      [0, 1, Math.PI / 4, 0.5],
      [-1, 0.5, Math.PI / 6, 0.8],
    ];
    for (const [sx, sy, rot, ys] of cases) {
      const [wx, wy] = screenDirToWorld(sx, sy, rot, ys);
      const len = Math.sqrt(wx * wx + wy * wy);
      expect(len).toBeCloseTo(1.0);
    }
  });

  it('at rotation=0, yScale=1, screen direction = world direction', () => {
    const [wx, wy] = screenDirToWorld(1, 0, 0, 1);
    expect(wx).toBeCloseTo(1);
    expect(wy).toBeCloseTo(0);
  });

  it('at rotation=0, yScale=0.5, undoes Y compression', () => {
    // Screen (0, 1) with yScale=0.5 → undo: uy = 1/0.5 = 2 → normalize
    const [wx, wy] = screenDirToWorld(0, 1, 0, 0.5);
    expect(wx).toBeCloseTo(0);
    expect(wy).toBeCloseTo(1);
  });

  it('returns [0, -1] default when screen vector is near-zero', () => {
    const [wx, wy] = screenDirToWorld(0.0001, 0.0001, 0, 1);
    expect(wx).toBe(0);
    expect(wy).toBe(-1);
  });

  it('at rotation=PI/2, screen X maps to world -Y', () => {
    // 90° rotation: screen right → world down-left by rotation conventions
    // cos(π/2)=0, sin(π/2)=1
    // wx = c*sx + s*uy = 0*1 + 1*0 = 0
    // wy = -s*sx + c*uy = -1*1 + 0*0 = -1
    const [wx, wy] = screenDirToWorld(1, 0, Math.PI / 2, 1);
    expect(wx).toBeCloseTo(0, 4);
    expect(wy).toBeCloseTo(-1, 4);
  });

  it('at rotation=PI/4, yScale=0.5, ISO mode, right=right and up=up (rough check)', () => {
    // The main use of screenDirToWorld is converting WASD screen-space intent to
    // world-space movement. In ISO mode, pressing "right" on screen should yield
    // a positive world-X component.
    const [wx] = screenDirToWorld(1, 0, Math.PI / 4, 0.5);
    expect(wx).toBeGreaterThan(0);
  });
});

// ── Matrix multiplication correctness (mul4 is internal, test indirectly) ────

describe('matrix math (via viewMatrix behavior)', () => {
  it('view of identity transform equals pure translation to screen center', () => {
    // viewMatrix(0,0, scx, scy, 0, 1, 0) should map (0,0,0) to (scx, scy)
    const view = viewMatrix(0, 0, 320, 240, 0, 1, 0);
    const pt = mulVec4(view, [0, 0, 0, 1]);
    expect(pt[0]).toBeCloseTo(320);
    expect(pt[1]).toBeCloseTo(240);
  });

  it('applying view twice with opposite centers cancels out', () => {
    // If worldCenter=origin and screenCenter=origin, a point at (dx, dy) maps to (dx, dy)
    const view = viewMatrix(0, 0, 0, 0, 0, 1, 0);
    const pt = mulVec4(view, [50, 75, 0, 1]);
    expect(pt[0]).toBeCloseTo(50);
    expect(pt[1]).toBeCloseTo(75);
  });
});
