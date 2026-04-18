// Procedural chunk-based tower generation.

import type { Panel, Vec4 } from './types';

const CHUNK_SIZE = 400;
const TOWERS_PER_CHUNK = 3;

// Deterministic hash for a chunk coordinate
function hash(cx: number, cy: number, seed: number): number {
  let h = (cx * 374761393 + cy * 668265263 + seed * 1274126177) | 0;
  h = (h ^ (h >> 13)) * 1103515245;
  h = h ^ (h >> 16);
  return h;
}

// Returns 0..1 from hash
function hashFloat(cx: number, cy: number, seed: number): number {
  return (hash(cx, cy, seed) & 0x7fffffff) / 0x7fffffff;
}

const COLORS: Vec4[] = [
  [0.82, 0.85, 0.90, 0.8],
  [0.85, 0.82, 0.88, 0.8],
  [0.80, 0.87, 0.86, 0.8],
  [0.88, 0.84, 0.80, 0.8],
];

const BORDERS: Vec4[] = [
  [0.60, 0.63, 0.70, 0.8],
  [0.65, 0.60, 0.68, 0.8],
  [0.58, 0.67, 0.66, 0.8],
  [0.68, 0.64, 0.60, 0.8],
];

const GAP = 10; // minimum spacing between towers

function rectsOverlap(
  x1: number, y1: number, w1: number, h1: number,
  x2: number, y2: number, w2: number, h2: number,
): boolean {
  return x1 - GAP < x2 + w2 && x1 + w1 + GAP > x2 &&
         y1 - GAP < y2 + h2 && y1 + h1 + GAP > y2;
}

function generateChunk(cx: number, cy: number): Panel[] {
  const panels: Panel[] = [];
  const baseX = cx * CHUNK_SIZE;
  const baseY = cy * CHUNK_SIZE;

  const attempts = 1 + Math.floor(hashFloat(cx, cy, 0) * TOWERS_PER_CHUNK);

  for (let i = 0; i < attempts; i++) {
    const fs = hashFloat(cx, cy, i * 3 + 3);
    const w = 60 + fs * 140;
    const h = 60 + hashFloat(cx, cy, i * 3 + 5) * 140;
    const x = baseX + hashFloat(cx, cy, i * 3 + 1) * (CHUNK_SIZE - w);
    const y = baseY + hashFloat(cx, cy, i * 3 + 2) * (CHUNK_SIZE - h);

    // Skip if overlaps any already placed panel
    let overlaps = false;
    for (const p of panels) {
      if (rectsOverlap(x, y, w, h, p.position[0], p.position[1], p.size[0], p.size[1])) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    const fz = hashFloat(cx, cy, i * 3 + 4);
    const z = 1 + Math.floor(fz * 2);
    const colorIdx = Math.floor(hashFloat(cx, cy, i * 3 + 6) * COLORS.length);

    panels.push({
      position: [x, y, z],
      size: [w, h],
      color: COLORS[colorIdx],
      border: BORDERS[colorIdx],
    });
  }

  return panels;
}

const loadedChunks = new Map<string, Panel[]>();

function chunkKey(cx: number, cy: number): string {
  return `${cx},${cy}`;
}

// Returns all panels in chunks around the player position.
// Generates new chunks as needed, removes far ones.
export function getVisiblePanels(px: number, py: number, radius: number): Panel[] {
  const cxMin = Math.floor((px - radius) / CHUNK_SIZE);
  const cxMax = Math.floor((px + radius) / CHUNK_SIZE);
  const cyMin = Math.floor((py - radius) / CHUNK_SIZE);
  const cyMax = Math.floor((py + radius) / CHUNK_SIZE);

  const activeKeys = new Set<string>();
  const panels: Panel[] = [];

  for (let cx = cxMin; cx <= cxMax; cx++) {
    for (let cy = cyMin; cy <= cyMax; cy++) {
      const key = chunkKey(cx, cy);
      activeKeys.add(key);

      if (!loadedChunks.has(key)) {
        loadedChunks.set(key, generateChunk(cx, cy));
      }

      panels.push(...loadedChunks.get(key)!);
    }
  }

  // Prune distant chunks
  for (const key of loadedChunks.keys()) {
    if (!activeKeys.has(key)) {
      loadedChunks.delete(key);
    }
  }

  return panels;
}
