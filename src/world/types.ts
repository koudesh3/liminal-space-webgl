// Entity, component, and world type definitions.

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
export type Vec4 = [number, number, number, number];

export type Panel = {
  position: Vec3;        // world-space origin (x, y, z)
  size: Vec2;            // width, height
  color: Vec4;           // RGBA fill
  border: Vec4;          // RGBA border
};

export type World = {
  panels: Panel[];
  player: {
    position: Vec3;
  };
  light: {
    position: Vec3;
    direction: Vec2;
    radius: number;
    coneAngle: number;
    torchOn: boolean;
  };
  camera: {
    rotation: number;
    yScale: number;
    zLift: number;
    isometric: boolean;
  };
  input: {
    direction: Vec2 | null;
  };
};
