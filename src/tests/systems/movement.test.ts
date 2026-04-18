// Tests for movement system contracts.
//
// Consumer: main.ts tick() calls updateMovement(world, dt) once per fixed 16.67ms step.
// The renderer then reads world.player.position to draw the player and center the camera.
//
// Contracts tested here:
//   - No movement when direction is null
//   - No movement in isometric mode (disabled)
//   - Player moves at SPEED world-units per ms in the given direction
//   - Diagonal movement is normalized (same speed as cardinal)
//   - Collision: player cannot overlap a panel at a higher z than the player
//   - Collision: player CAN overlap a panel at the same or lower z
//   - Slide: player slides along a wall rather than stopping dead
//   - Collision uses BORDER (3px expansion) in the overlap test
//   - Player z is never modified by movement

import { describe, it, expect } from 'vitest';
import { updateMovement } from '../../systems/movement';
import type { World, Panel } from '../../world/types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeWorld(overrides: Partial<World> = {}): World {
  return {
    panels: [],
    player: {
      position: [0, 0, 0],
    },
    light: {
      position: [0, 0, 0],
      direction: [0, -1],
      radius: 250,
      coneAngle: Math.PI / 3,
      torchOn: true,
    },
    camera: {
      rotation: Math.PI / 4,
      yScale: 0.5,
      zLift: 40,
      isometric: false,
    },
    input: {
      direction: null,
    },
    ...overrides,
  };
}

function makePanel(x: number, y: number, z: number, w: number, h: number): Panel {
  return {
    position: [x, y, z],
    size: [w, h],
    color: [1, 1, 1, 1],
    border: [0, 0, 0, 1],
  };
}

const SPEED = 0.15;       // matches systems/movement.ts
const PLAYER_HALF = 8;    // matches systems/movement.ts
const BORDER = 3;         // matches systems/movement.ts
const DT = 16.67;         // one fixed timestep in ms

// ── No-op cases ────────────────────────────────────────────────────────────────

describe('updateMovement()', () => {
  it('does not move player when direction is null', () => {
    const world = makeWorld({ input: { direction: null } });
    updateMovement(world, DT);
    expect(world.player.position).toEqual([0, 0, 0]);
  });

  it('does not move player in isometric mode', () => {
    const world = makeWorld({
      camera: { rotation: Math.PI/4, yScale: 0.5, zLift: 40, isometric: true },
      input: { direction: [1, 0] },
    });
    updateMovement(world, DT);
    expect(world.player.position).toEqual([0, 0, 0]);
  });

  // ── Basic displacement ────────────────────────────────────────────────────────

  it('moves player SPEED * dt world-units per step along X', () => {
    const world = makeWorld({ input: { direction: [1, 0] } });
    updateMovement(world, DT);
    const expected = SPEED * DT;
    expect(world.player.position[0]).toBeCloseTo(expected);
    expect(world.player.position[1]).toBeCloseTo(0);
  });

  it('moves player SPEED * dt world-units per step along Y', () => {
    const world = makeWorld({ input: { direction: [0, 1] } });
    updateMovement(world, DT);
    expect(world.player.position[0]).toBeCloseTo(0);
    expect(world.player.position[1]).toBeCloseTo(SPEED * DT);
  });

  it('diagonal movement covers the same distance as cardinal movement', () => {
    // input.direction is already normalized by input.ts, so pass (1/√2, 1/√2)
    const d = 1 / Math.sqrt(2);
    const world = makeWorld({ input: { direction: [d, d] } });
    updateMovement(world, DT);
    const dist = Math.sqrt(world.player.position[0] ** 2 + world.player.position[1] ** 2);
    expect(dist).toBeCloseTo(SPEED * DT, 5);
  });

  it('does not modify the z component of player position', () => {
    const world = makeWorld({ input: { direction: [1, 0] } });
    world.player.position = [0, 0, 2]; // set a non-zero z
    updateMovement(world, DT);
    expect(world.player.position[2]).toBe(2);
  });

  // ── Collision against panels above player ─────────────────────────────────────

  it('stops player from entering a panel at z > player.z', () => {
    // Panel at (100, -50, 1) size 100x100 → occupies x:[100,200], y:[-50,50] plus BORDER
    const panel = makePanel(100, -50, 1, 100, 100);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0] },
    });
    // Put player just left of the panel's border-expanded left edge
    const leftEdge = 100 - BORDER - PLAYER_HALF;
    world.player.position = [leftEdge - 0.01, 0, 0];

    updateMovement(world, DT);

    // Player should be pushed back to the edge, not inside the panel
    expect(world.player.position[0]).toBeLessThanOrEqual(leftEdge + 0.001);
  });

  it('does not collide with a panel at the same z as the player', () => {
    // Player is at z=0; panel is also at z=0 — should not block
    const panel = makePanel(10, -50, 0, 100, 100);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0] },
      player: { position: [0, 0, 0] },
    });
    updateMovement(world, DT);
    // Player should have moved freely rightward
    expect(world.player.position[0]).toBeCloseTo(SPEED * DT);
  });

  it('does not collide with a panel at lower z than the player', () => {
    // Player is at z=2; panel is at z=1 — should not block
    const panel = makePanel(10, -50, 1, 100, 100);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0] },
    });
    world.player.position = [0, 0, 2];
    updateMovement(world, DT);
    expect(world.player.position[0]).toBeCloseTo(SPEED * DT);
  });

  // ── Border expansion ──────────────────────────────────────────────────────────

  it('collision boundary extends BORDER (3) units beyond the panel edge', () => {
    // Panel at (100, -50, 1), size 100x100.
    // Border-expanded left edge = 100 - 3 = 97.
    // Collision edge for player = 97 - PLAYER_HALF = 89.
    // Place player at x=89, moving right: should be blocked at or before x=89.
    const panel = makePanel(100, -50, 1, 100, 100);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0] },
    });
    world.player.position = [89 - 0.01, 0, 0];
    updateMovement(world, DT);
    expect(world.player.position[0]).toBeLessThanOrEqual(89 + 0.001);
  });

  it('player is not blocked when approaching from outside the border-expanded edge', () => {
    // Player at x=-10, moving right toward a panel far away: should move freely
    const panel = makePanel(200, -50, 1, 100, 100);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0] },
    });
    world.player.position = [-10, 0, 0];
    updateMovement(world, DT);
    expect(world.player.position[0]).toBeGreaterThan(-10);
  });

  // ── Slide (per-axis resolution) ────────────────────────────────────────────────

  it('slides along a wall when moving diagonally into it', () => {
    // Panel on the right at x=100. Player moves right and slightly down.
    // After collision: x should be clamped, but y should advance (slide).
    const panel = makePanel(100, -200, 1, 100, 400);
    const world = makeWorld({
      panels: [panel],
      input: { direction: [1, 0.01] }, // nearly horizontal but slight downward component
    });
    const startY = world.player.position[1];
    updateMovement(world, DT);
    // Should be blocked in X (not past left edge of panel+border+player_half)
    expect(world.player.position[0]).toBeLessThan(100 - BORDER - PLAYER_HALF + 1);
    // Y should still advance (slide)
    expect(world.player.position[1]).toBeGreaterThan(startY);
  });
});
