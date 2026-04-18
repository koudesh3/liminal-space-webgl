// Reads world state, issues draw calls.

import { getGL, compileShader, linkProgram, getCanvasSize } from './context';
import { VERT_SRC, FRAG_SRC, MAX_OCCLUDERS } from './shaders';
import { getUnitQuad, getUnitWall } from './buffers';
import { ortho, viewMatrix } from './projection';
import type { World, Panel, Vec4 } from '../world/types';
import { BORDER_WIDTH, PLAYER_HALF, PLAYER_SIZE } from '../constants';

let program: WebGLProgram;
let u_projection: WebGLUniformLocation;
let u_view: WebGLUniformLocation;
let u_color: WebGLUniformLocation;
let u_quadPos: WebGLUniformLocation;
let u_quadScale: WebGLUniformLocation;
let u_quadDir: WebGLUniformLocation;
let u_quadZ: WebGLUniformLocation;
let u_lightPos: WebGLUniformLocation;
let u_lightDir: WebGLUniformLocation;
let u_coneAngle: WebGLUniformLocation;
let u_lightInner: WebGLUniformLocation;
let u_lightOuter: WebGLUniformLocation;
let u_zScale: WebGLUniformLocation;
let u_ambient: WebGLUniformLocation;
let u_lightColor: WebGLUniformLocation;
let u_ambientGlow: WebGLUniformLocation;
let u_faceNormal: WebGLUniformLocation;
let u_occluderCount: WebGLUniformLocation;
let u_occluders: WebGLUniformLocation[];
let posAttribLoc: number;

const BORDER_Z_OFFSET = -0.01;
const LIGHT_Z_SCALE = 50;
const GROUND_COLOR: Vec4 = [1.0, 1.0, 1.0, 1.0];
const GROUND_EXTENT = 2000;

export function initDraw(): void {
  const gl = getGL();
  const vert = compileShader(gl.VERTEX_SHADER, VERT_SRC);
  const frag = compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);
  program = linkProgram(vert, frag);

  posAttribLoc = gl.getAttribLocation(program, 'a_position');
  u_projection = gl.getUniformLocation(program, 'u_projection')!;
  u_view = gl.getUniformLocation(program, 'u_view')!;
  u_color = gl.getUniformLocation(program, 'u_color')!;
  u_quadPos = gl.getUniformLocation(program, 'u_quadPos')!;
  u_quadScale = gl.getUniformLocation(program, 'u_quadScale')!;
  u_quadDir = gl.getUniformLocation(program, 'u_quadDir')!;
  u_quadZ = gl.getUniformLocation(program, 'u_quadZ')!;
  u_lightPos = gl.getUniformLocation(program, 'u_lightPos')!;
  u_lightDir = gl.getUniformLocation(program, 'u_lightDir')!;
  u_coneAngle = gl.getUniformLocation(program, 'u_coneAngle')!;
  u_lightInner = gl.getUniformLocation(program, 'u_lightInner')!;
  u_lightOuter = gl.getUniformLocation(program, 'u_lightOuter')!;
  u_zScale = gl.getUniformLocation(program, 'u_zScale')!;
  u_ambient = gl.getUniformLocation(program, 'u_ambient')!;
  u_lightColor = gl.getUniformLocation(program, 'u_lightColor')!;
  u_ambientGlow = gl.getUniformLocation(program, 'u_ambientGlow')!;
  u_faceNormal = gl.getUniformLocation(program, 'u_faceNormal')!;
  u_occluderCount = gl.getUniformLocation(program, 'u_occluderCount')!;
  u_occluders = [];
  for (let i = 0; i < MAX_OCCLUDERS; i++) {
    u_occluders.push(gl.getUniformLocation(program, `u_occluders[${i}]`)!);
  }

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}

// Draw a flat quad at (x, y, z) with size (w, h)
function drawFlat(x: number, y: number, z: number, w: number, h: number, color: Vec4, proj: Float32Array, view: Float32Array): void {
  const gl = getGL();
  const quad = getUnitQuad(gl, posAttribLoc);
  gl.useProgram(program);
  gl.uniformMatrix4fv(u_projection, false, proj);
  gl.uniformMatrix4fv(u_view, false, view);
  gl.uniform3f(u_quadPos, x, y, z);
  gl.uniform3f(u_quadScale, w, h, 0);
  gl.uniform3f(u_quadDir, 0, 0, 0);
  gl.uniform1f(u_quadZ, 0);
  gl.uniform2f(u_faceNormal, 0, 0); // floor — no backface check
  gl.uniform4fv(u_color, color);
  gl.bindVertexArray(quad.vao);
  gl.drawElements(gl.TRIANGLES, quad.indexCount, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}

// Draw a vertical wall from (x0,y0) to (x1,y1), from zBot to zTop.
function drawWall(x0: number, y0: number, x1: number, y1: number, zBot: number, zTop: number, color: Vec4, proj: Float32Array, view: Float32Array, nx: number, ny: number): void {
  const gl = getGL();
  const wall = getUnitWall(gl, posAttribLoc);
  gl.useProgram(program);
  gl.uniformMatrix4fv(u_projection, false, proj);
  gl.uniformMatrix4fv(u_view, false, view);
  gl.uniform3f(u_quadPos, x0, y0, zBot);
  gl.uniform3f(u_quadScale, 0, 0, 0);
  gl.uniform3f(u_quadDir, x1 - x0, y1 - y0, 0);
  gl.uniform1f(u_quadZ, zTop - zBot);
  gl.uniform2f(u_faceNormal, nx, ny);
  gl.uniform4fv(u_color, color);
  gl.bindVertexArray(wall.vao);
  gl.drawElements(gl.TRIANGLES, wall.indexCount, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}

function wallColor(color: Vec4, factor: number): Vec4 {
  return [color[0] * factor, color[1] * factor, color[2] * factor, 1.0];
}

function drawPanel(panel: Panel, world: World, proj: Float32Array, view: Float32Array, topOnly = false): void {
  const [x, y, z] = panel.position;
  const [w, h] = panel.size;

  if (topOnly) {
    // Exclude own panel from occluders so top doesn't self-shadow
    const b = BORDER_WIDTH;
    setOccluders(world, panel);
    drawFlat(x - b, y - b, z, w + b * 2, h + b * 2, [0.5, 0.5, 0.53, 1.0], proj, view);
  } else {
    const b = BORDER_WIDTH;
    drawFlat(x - b, y - b, z + BORDER_Z_OFFSET, w + b * 2, h + b * 2, panel.border, proj, view);
    drawFlat(x, y, z, w, h, panel.color, proj, view);
  }
}

function drawWalls(panel: Panel, baseZ: number, proj: Float32Array, view: Float32Array): void {
  const [x, y, z] = panel.position;
  const [w, h] = panel.size;
  if (z <= baseZ) return;

  const b = BORDER_WIDTH;
  const x0 = x - b, y0 = y - b;
  const x1 = x + w + b, y1 = y + h + b;

  const wb: Vec4 = [0.45, 0.45, 0.48, 1.0];
  drawWall(x0, y1, x1, y1, baseZ, z, wallColor(wb, 0.85), proj, view, 0, 1);   // south
  drawWall(x1, y0, x1, y1, baseZ, z, wallColor(wb, 0.90), proj, view, 1, 0);   // east
  drawWall(x0, y0, x1, y0, baseZ, z, wallColor(wb, 0.95), proj, view, 0, -1);  // north
  drawWall(x0, y0, x0, y1, baseZ, z, wallColor(wb, 0.88), proj, view, -1, 0);  // west
}

// Set occluders sorted by distance (closest first), optionally excluding one panel
function setOccluders(world: World, exclude?: Panel): void {
  const gl = getGL();
  const playerZ = world.player.position[2];
  const [px, py] = world.player.position;
  const b = BORDER_WIDTH;
  const r = world.light.radius * 1.5; // extend past light radius to catch shadow casters

  // Collect candidates with distance
  const candidates: { panel: Panel; dist: number }[] = [];
  for (const panel of world.panels) {
    if (panel === exclude) continue;
    if (panel.position[2] <= playerZ) continue;
    const [x, y] = panel.position;
    const [w, h] = panel.size;
    if (x + w + b < px - r || x - b > px + r || y + h + b < py - r || y - b > py + r) continue;
    const cx = x + w / 2, cy = y + h / 2;
    const dist = (cx - px) * (cx - px) + (cy - py) * (cy - py);
    candidates.push({ panel, dist });
  }

  // Sort by distance, take closest
  candidates.sort((a, b) => a.dist - b.dist);
  const count = Math.min(candidates.length, MAX_OCCLUDERS);
  for (let i = 0; i < count; i++) {
    const p = candidates[i].panel;
    const [x, y] = p.position;
    const [w, h] = p.size;
    gl.uniform4f(u_occluders[i], x - b, y - b, w + b * 2, h + b * 2);
  }

  gl.uniform1i(u_occluderCount, count);
}

// Flicker — short bursts of quick dimming, then long steady periods
let flickerValue = 1.0;
let flickerBurst = 0;     // frames left in a flicker burst
let flickerCooldown = 0;  // ms until next burst

function torchFlicker(): number {
  const dt = 16;

  if (flickerBurst > 0) {
    // During burst: rapid random jitter between 85-100%
    flickerValue = 0.85 + Math.random() * 0.15;
    flickerBurst--;
    if (flickerBurst === 0) {
      flickerValue = 1.0;
      flickerCooldown = 4000 + Math.random() * Math.random() * 20000;
    }
  } else {
    flickerValue = 1.0;
    flickerCooldown -= dt;
    if (flickerCooldown <= 0) {
      // Start a burst: 3-12 frames of jitter
      flickerBurst = 3 + Math.floor(Math.random() * 10);
    }
  }

  return flickerValue;
}

function torchBrightness(): number {
  // During bursts, overall brightness dips too
  return flickerBurst > 0 ? 0.7 + Math.random() * 0.2 : 1.0;
}

export function drawWorld(world: World): void {
  const gl = getGL();
  const { width, height } = getCanvasSize();

  const maxDim = Math.max(width, height);
  const proj = ortho(width, height, -maxDim, maxDim);

  const wcx = world.player.position[0];
  const wcy = world.player.position[1];
  const view = viewMatrix(wcx, wcy, width / 2, height / 2, world.camera.rotation, world.camera.yScale, world.camera.zLift);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Set light uniforms
  gl.useProgram(program);
  const lp = world.light.position;
  gl.uniform3f(u_lightPos, lp[0], lp[1], lp[2]);
  gl.uniform2f(u_lightDir, world.light.direction[0], world.light.direction[1]);
  gl.uniform1f(u_coneAngle, world.camera.isometric ? Math.PI : world.light.coneAngle);
  const effectiveRadius = world.light.torchOn ? world.light.radius * torchFlicker() : 0;
  gl.uniform1f(u_lightInner, effectiveRadius * 0.4);
  gl.uniform1f(u_lightOuter, effectiveRadius);
  gl.uniform1f(u_zScale, LIGHT_Z_SCALE);
  gl.uniform3f(u_ambient, 0.0, 0.0, 0.0);
  const bright = world.light.torchOn ? torchBrightness() : 0;
  gl.uniform3f(u_lightColor, 1.0 * bright, 0.95 * bright, 0.85 * bright);
  // During flicker, ambient glow drops — light concentrates into cone
  gl.uniform1f(u_ambientGlow, flickerBurst > 0 ? 0.25 : 0.6);
  setOccluders(world);

  // Ground plane
  drawFlat(wcx - GROUND_EXTENT, wcy - GROUND_EXTENT, 0, GROUND_EXTENT * 2, GROUND_EXTENT * 2, GROUND_COLOR, proj, view);

  // Cull panels outside visible range
  const cullR = 500;
  const visible = world.panels.filter(p => {
    const [x, y] = p.position;
    const [w, h] = p.size;
    return x + w > wcx - cullR && x < wcx + cullR && y + h > wcy - cullR && y < wcy + cullR;
  });

  const sorted = visible.sort((a, b) => a.position[2] - b.position[2]);
  const playerZ = world.player.position[2];

  // Pass 1: panels at or below player — walls + dark gray tops, all lit
  for (const panel of sorted) {
    if (panel.position[2] <= playerZ) {
      drawWalls(panel, 0, proj, view);
      drawPanel(panel, world, proj, view, true);
      setOccluders(world);
    }
  }

  // Pass 2: player — no lighting
  gl.uniform1f(u_lightInner, 99999.0);
  gl.uniform1f(u_lightOuter, 99999.0);
  gl.uniform1i(u_occluderCount, 0);
  const [px, py, pz] = world.player.position;
  drawFlat(px - PLAYER_HALF, py - PLAYER_HALF, pz + 0.02, PLAYER_SIZE, PLAYER_SIZE, [0.2, 0.2, 0.6, 1.0], proj, view);
  gl.uniform1f(u_lightInner, effectiveRadius * 0.4);
  gl.uniform1f(u_lightOuter, effectiveRadius);
  setOccluders(world);

  // Pass 3: panels above player — walls + tops lit, panel surfaces depth-off
  gl.disable(gl.BLEND);
  for (const panel of sorted) {
    if (panel.position[2] > playerZ) {
      drawWalls(panel, 0, proj, view);
      gl.depthMask(false);
      drawPanel(panel, world, proj, view, true);
      setOccluders(world); // restore after top cleared them
      gl.depthMask(true);
    }
  }
  gl.enable(gl.BLEND);
}
