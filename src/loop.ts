// Game loop. Fixed timestep tick, render call.

export type TickFn = (dt: number) => void;
export type RenderFn = () => void;

const TIMESTEP = 1000 / 60; // ~16.67ms fixed tick

export function startLoop(tick: TickFn, render: RenderFn): void {
  let last = performance.now();
  let accumulator = 0;

  function frame(now: number): void {
    const elapsed = now - last;
    last = now;
    accumulator += elapsed;

    while (accumulator >= TIMESTEP) {
      tick(TIMESTEP);
      accumulator -= TIMESTEP;
    }

    render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}
