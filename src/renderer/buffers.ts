// Vertex/index buffer creation and upload.
// Uses reusable unit quads — position/size set via uniforms.

export type QuadBuffers = {
  vao: WebGLVertexArrayObject;
  indexCount: number;
};

let unitQuad: QuadBuffers | null = null;
let unitWall: QuadBuffers | null = null;

// Unit quad: (0,0) to (1,1) at z=0. Shader transforms via uniforms.
export function getUnitQuad(gl: WebGL2RenderingContext, posAttribLoc: number): QuadBuffers {
  if (unitQuad) return unitQuad;

  const verts = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    1, 1, 0,
  ]);
  const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(posAttribLoc);
  gl.vertexAttribPointer(posAttribLoc, 3, gl.FLOAT, false, 0, 0);

  const ebo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  unitQuad = { vao, indexCount: indices.length };
  return unitQuad;
}

// Unit wall: vertical quad from (0,0,0)-(1,0,0) at bottom to (0,0,1)-(1,0,1) at top.
// x goes 0..1 along the wall, z goes 0..1 from bottom to top, y=0.
export function getUnitWall(gl: WebGL2RenderingContext, posAttribLoc: number): QuadBuffers {
  if (unitWall) return unitWall;

  const verts = new Float32Array([
    0, 0, 1,  // top-left
    1, 0, 1,  // top-right
    0, 0, 0,  // bottom-left
    1, 0, 0,  // bottom-right
  ]);
  const indices = new Uint16Array([0, 2, 1, 1, 2, 3]);

  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const vbo = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(posAttribLoc);
  gl.vertexAttribPointer(posAttribLoc, 3, gl.FLOAT, false, 0, 0);

  const ebo = gl.createBuffer()!;
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

  gl.bindVertexArray(null);

  unitWall = { vao, indexCount: indices.length };
  return unitWall;
}
