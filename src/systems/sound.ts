// Sound system. Manages ambient loops, footsteps, flashlight click, intro.

import type { World } from '../world/types';

// Ambient loops — play constantly
let windLoop: HTMLAudioElement;
let breathingLoop: HTMLAudioElement;
let flickerLoop: HTMLAudioElement;

// Triggered sounds
let footstepsLoop: HTMLAudioElement;
let flashlightClick: HTMLAudioElement;
let introSound: HTMLAudioElement;

let started = false;
let interacted = false;
let wasWalking = false;
let wasTorchOn = true;

function makeLoop(src: string, volume = 1): HTMLAudioElement {
  const audio = new Audio(src);
  audio.loop = true;
  audio.volume = volume;
  return audio;
}

function makeOneShot(src: string, volume = 1): HTMLAudioElement {
  const audio = new Audio(src);
  audio.volume = volume;
  return audio;
}

export function initSound(): void {
  windLoop = makeLoop('/sounds/wind.mp3', 0.4);
  breathingLoop = makeLoop('/sounds/mask_breathing.mp3', 0.12);
  flickerLoop = makeLoop('/sounds/light_flicker.mp3', 0.3);
  footstepsLoop = makeLoop('/sounds/footsteps.mp3', 0.85);
  flashlightClick = makeOneShot('/sounds/flashlight_on.mp3', 1.0);
  introSound = makeOneShot('/sounds/intro.mp3', 1.0);

  // Unlock audio on first user interaction
  const unlock = () => {
    interacted = true;
    window.removeEventListener('click', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('click', unlock);
  window.addEventListener('keydown', unlock);
}

// Browsers block autoplay until user interaction. Call this on first click.
function startAmbient(): void {
  if (started) return;
  started = true;

  introSound.play();
  windLoop.play();
  breathingLoop.play();
  flickerLoop.play();
}

export function updateSound(world: World): void {
  if (!interacted) return;
  if (!started) {
    startAmbient();
  }

  // Footsteps: play while walking
  const isWalking = world.input.direction !== null;
  if (isWalking && !wasWalking) {
    footstepsLoop.currentTime = 0;
    footstepsLoop.play();
  } else if (!isWalking && wasWalking) {
    footstepsLoop.pause();
  }
  wasWalking = isWalking;

  // Flashlight click on toggle
  const torchOn = world.light.torchOn;
  if (torchOn !== wasTorchOn) {
    flashlightClick.currentTime = 0;
    flashlightClick.play();
  }
  wasTorchOn = torchOn;
}
