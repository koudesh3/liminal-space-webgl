// Animates camera between top-down and isometric views.

import type { World } from '../world/types';
import { consumeClick } from '../input';

const ISO = { rotation: Math.PI / 4, yScale: 0.5, zLift: 40 };
const TOP = { rotation: 0, yScale: 1.0, zLift: 0 };
const LERP_SPEED = 0.005; // per ms

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function updateCamera(world: World, dt: number): void {
  if (consumeClick()) {
    world.camera.isometric = !world.camera.isometric;
  }

  const target = world.camera.isometric ? ISO : TOP;
  const t = Math.min(1, LERP_SPEED * dt);

  world.camera.rotation = lerp(world.camera.rotation, target.rotation, t);
  world.camera.yScale = lerp(world.camera.yScale, target.yScale, t);
  world.camera.zLift = lerp(world.camera.zLift, target.zLift, t);
}
