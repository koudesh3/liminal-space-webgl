// Constructs the initial world state. Panels are generated procedurally.

import type { World } from './types';

export function buildLevel(): World {
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
      isometric: true,
    },
    input: {
      direction: null,
    },
  };
}
