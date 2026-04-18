// Reads player position + mouse, computes light cone direction with rotational inertia.

import type { Vec2, World } from '../world/types';
import { getMouseScreen, consumeTorchToggle } from '../input';
import { getCanvasSize } from '../renderer/context';

const TURN_SPEED = 0.015; // radians per ms

// Pure function: rotate current direction toward target, clamped by maxRotation radians.
export function rotateToward(cur: Vec2, target: Vec2, maxRotation: number): Vec2 {
  const [curX, curY] = cur;
  const [targetX, targetY] = target;

  const cross = curX * targetY - curY * targetX;
  const dot = curX * targetX + curY * targetY;
  let angleDiff = Math.atan2(cross, dot);

  angleDiff = Math.max(-maxRotation, Math.min(maxRotation, angleDiff));

  const cos = Math.cos(angleDiff);
  const sin = Math.sin(angleDiff);
  const newX = curX * cos - curY * sin;
  const newY = curX * sin + curY * cos;

  const len = Math.sqrt(newX * newX + newY * newY);
  return [newX / len, newY / len];
}

export function updateLighting(world: World, dt: number): void {
  world.light.position = [...world.player.position];

  if (consumeTorchToggle()) {
    world.light.torchOn = !world.light.torchOn;
  }

  if (world.camera.isometric) return;

  const [mx, my] = getMouseScreen();
  const { width, height } = getCanvasSize();
  const dx = mx - width / 2;
  const dy = my - height / 2;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return;

  const target: Vec2 = [dx / len, dy / len];
  world.light.direction = rotateToward(world.light.direction, target, TURN_SPEED * dt);
}
