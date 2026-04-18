// WebGL2 context setup, shader compilation helpers.

let gl: WebGL2RenderingContext;
let canvasWidth = 0;
let canvasHeight = 0;
let cssWidth = 0;
let cssHeight = 0;

export function initContext(canvas: HTMLCanvasElement): WebGL2RenderingContext {
  const ctx = canvas.getContext('webgl2');
  if (!ctx) throw new Error('WebGL2 not supported');

  gl = ctx;
  resize(canvas);
  return gl;
}

export function resize(canvas: HTMLCanvasElement): void {
  const dpr = window.devicePixelRatio || 1;
  cssWidth = canvas.clientWidth;
  cssHeight = canvas.clientHeight;
  canvasWidth = cssWidth * dpr;
  canvasHeight = cssHeight * dpr;
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  gl.viewport(0, 0, canvasWidth, canvasHeight);
}

export function getGL(): WebGL2RenderingContext {
  return gl;
}

export function getCanvasSize(): { width: number; height: number } {
  return { width: cssWidth, height: cssHeight };
}

export function compileShader(type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

export function linkProgram(vert: WebGLShader, frag: WebGLShader): WebGLProgram {
  const program = gl.createProgram()!;
  gl.attachShader(program, vert);
  gl.attachShader(program, frag);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log}`);
  }
  return program;
}
