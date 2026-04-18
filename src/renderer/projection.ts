// Orthographic projection + isometric view matrix.

// Multiply two column-major 4x4 matrices: result = a * b
function mul4(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      out[col * 4 + row] =
        a[0 * 4 + row] * b[col * 4 + 0] +
        a[1 * 4 + row] * b[col * 4 + 1] +
        a[2 * 4 + row] * b[col * 4 + 2] +
        a[3 * 4 + row] * b[col * 4 + 3];
    }
  }
  return out;
}

function identity(): Float32Array {
  const out = new Float32Array(16);
  out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
  return out;
}

function translate(tx: number, ty: number, tz: number): Float32Array {
  const out = identity();
  out[12] = tx; out[13] = ty; out[14] = tz;
  return out;
}

// Pure orthographic projection.
export function ortho(
  width: number,
  height: number,
  near: number,
  far: number,
): Float32Array {
  const out = new Float32Array(16);
  out[0]  =  2 / width;
  out[5]  = -2 / height; // y-down screen convention
  out[10] = -2 / (far - near);
  out[12] = -1;
  out[13] =  1;
  out[14] = -(far + near) / (far - near);
  out[15] =  1;
  return out;
}

// Dimetric view matrix for 2D isometric look.
// Foreshortens Y (depth) and maps Z to vertical screen offset.
//
//   screen_x = world_x
//   screen_y = world_y * yScale - world_z * zLift
//
// Centered around (cx, cy) so foreshortening scales from the middle.
// TODO: export inverse for screen-to-world unprojection (mouse picking).
export function viewMatrix(
  worldCX: number,
  worldCY: number,
  screenCX: number,
  screenCY: number,
  rotation: number,
  yScale: number,
  zLift: number,
): Float32Array {
  // Move world center to origin
  const t1 = translate(-worldCX, -worldCY, 0);

  // Rotate in XY plane (around Z axis) — turns rectangles into diamonds
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const rot = identity();
  rot[0] = c;  rot[1] = s;
  rot[4] = -s; rot[5] = c;

  // Dimetric transform: compress Y, map Z to -Y offset
  const dim = identity();
  dim[5] = yScale;   // foreshorten Y
  dim[9] = -zLift;   // Z moves things up on screen (negative Y in screen coords)

  // Place result at screen center
  const t2 = translate(screenCX, screenCY, 0);

  // Pipeline: world center to origin → rotate → foreshorten → to screen center
  return mul4(t2, mul4(dim, mul4(rot, t1)));
}

// Convert a screen-space direction to world-space XY direction.
// Undoes the rotation + yScale foreshortening (translations don't affect directions).
export function screenDirToWorld(
  screenDx: number,
  screenDy: number,
  rotation: number,
  yScale: number,
): [number, number] {
  // Undo foreshortening
  const uy = screenDy / yScale;
  // Undo rotation
  const c = Math.cos(rotation);
  const s = Math.sin(rotation);
  const wx = c * screenDx + s * uy;
  const wy = -s * screenDx + c * uy;
  // Normalize
  const len = Math.sqrt(wx * wx + wy * wy);
  if (len < 0.001) return [0, -1]; // default: up
  return [wx / len, wy / len];
}
