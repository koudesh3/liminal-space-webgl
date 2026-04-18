// Entry. Creates canvas, starts game loop.

import { initContext, resize } from './renderer/context';
import { initDraw, drawWorld } from './renderer/draw';
import { initInput, readInput } from './input';
import { updateMovement } from './systems/movement';
import { updateLighting } from './systems/lighting';
import { updateCamera } from './systems/camera';
import { initSound, updateSound } from './systems/sound';
import { startLoop } from './loop';
import { world } from './state';
import { getVisiblePanels } from './world/generate';

const canvas = document.getElementById('game') as HTMLCanvasElement;
initContext(canvas);
initDraw();
initInput();
initSound();

window.addEventListener('resize', () => resize(canvas));

function tick(dt: number): void {
  readInput(world);
  updateCamera(world, dt);
  updateMovement(world, dt);
  updateLighting(world, dt);
  updateSound(world);

  // Regenerate visible panels around player
  const [px, py] = world.player.position;
  world.panels = getVisiblePanels(px, py, 600);
}

function render(): void {
  drawWorld(world);
}

startLoop(tick, render);
