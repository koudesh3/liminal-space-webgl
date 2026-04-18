// World state. Single source of truth.

import type { World } from './world/types';
import { buildLevel } from './world/builder';

export const world: World = buildLevel();
