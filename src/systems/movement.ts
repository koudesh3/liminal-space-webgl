// Reads input intent + state, updates player position.

import type { World, Panel } from '../world/types';
import { PLAYER_HALF, BORDER_WIDTH } from '../constants';

const SPEED = 0.15; // world-units per ms

// Does a player-sized box at (px, py) overlap a panel including border?
function overlapsPanel(px: number, py: number, panel: Panel): boolean {
  const [x, y] = panel.position;
  const [w, h] = panel.size;
  const bx = x - BORDER_WIDTH, by = y - BORDER_WIDTH;
  const bw = w + BORDER_WIDTH * 2, bh = h + BORDER_WIDTH * 2;
  return px + PLAYER_HALF > bx && px - PLAYER_HALF < bx + bw &&
         py + PLAYER_HALF > by && py - PLAYER_HALF < by + bh;
}

// Push player position outside a blocking panel (per-axis slide)
function pushOutOfPanel(px: number, py: number, oldX: number, oldY: number, panel: Panel): [number, number] {
  const [fx, fy] = panel.position;
  const [fw, fh] = panel.size;
  const bx = fx - BORDER_WIDTH, by = fy - BORDER_WIDTH;
  const bw = fw + BORDER_WIDTH * 2, bh = fh + BORDER_WIDTH * 2;

  let rx = px;
  let ry = py;

  if (overlapsPanel(px, oldY, panel)) {
    if (oldX <= bx) rx = bx - PLAYER_HALF;
    else if (oldX >= bx + bw) rx = bx + bw + PLAYER_HALF;
  }

  if (overlapsPanel(rx, py, panel)) {
    if (oldY <= by) ry = by - PLAYER_HALF;
    else if (oldY >= by + bh) ry = by + bh + PLAYER_HALF;
  }

  return [rx, ry];
}

export function updateMovement(world: World, dt: number): void {
  if (world.camera.isometric) return;
  const { direction } = world.input;
  if (!direction) return;

  const player = world.player;
  const [px, py, pz] = player.position;

  let nx = px + direction[0] * SPEED * dt;
  let ny = py + direction[1] * SPEED * dt;

  // Collide with all towers (panels above ground)
  for (const panel of world.panels) {
    if (panel.position[2] > pz && overlapsPanel(nx, ny, panel)) {
      [nx, ny] = pushOutOfPanel(nx, ny, px, py, panel);
    }
  }

  player.position = [nx, ny, pz];
}
