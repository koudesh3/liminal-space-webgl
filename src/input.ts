// Keyboard input. Reads keys, writes intent to state.

import type { World } from './world/types';

const keys = new Set<string>();

let clickedThisFrame = false;
let mouseX = 0;
let mouseY = 0;
let torchToggled = false;

export function initInput(): void {
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys.add(k);
    if (k === 'l') torchToggled = true;
  });
  window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener('click', () => { clickedThisFrame = true; });
  window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
}

export function consumeTorchToggle(): boolean {
  if (torchToggled) {
    torchToggled = false;
    return true;
  }
  return false;
}

export function consumeClick(): boolean {
  if (clickedThisFrame) {
    clickedThisFrame = false;
    return true;
  }
  return false;
}

export function getMouseScreen(): [number, number] {
  return [mouseX, mouseY];
}

export function readInput(world: World): void {
  let dx = 0;
  let dy = 0;

  if (keys.has('w') || keys.has('arrowup'))    dy -= 1;
  if (keys.has('s') || keys.has('arrowdown'))   dy += 1;
  if (keys.has('a') || keys.has('arrowleft'))   dx -= 1;
  if (keys.has('d') || keys.has('arrowright'))   dx += 1;

  if (dx !== 0 || dy !== 0) {
    // Normalize diagonal movement
    const len = Math.sqrt(dx * dx + dy * dy);
    world.input.direction = [dx / len, dy / len];
  } else {
    world.input.direction = null;
  }

}
