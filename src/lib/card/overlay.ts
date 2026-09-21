import { ASPECTS, type Aspect, type OverlayTransform } from "./draw";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeRotation(degrees: number) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

/** Bound resizing, not placement. The canvas itself clips at its actual edges. */
export function constrainOverlay(value: OverlayTransform): OverlayTransform {
  const rotation = normalizeRotation(value.rotation);
  return {
    scale: clamp(value.scale, 0.35, 1),
    rotation,
    x: value.x,
    y: value.y,
  };
}

/** Preserve the point under the fingers as their midpoint moves, scales, and rotates. */
export function pinchOverlay(start: OverlayTransform,
  origin: { x: number; y: number }, current: { x: number; y: number },
  ratio: number, aspect: Aspect, rotationDelta = 0): OverlayTransform {
  const height = ASPECTS[aspect].h / 10.8;
  const rotation = normalizeRotation(start.rotation + rotationDelta);
  const scale = clamp(start.scale * ratio, 0.35, 1);
  const startRadians = (start.rotation * Math.PI) / 180;
  const nextRadians = (rotation * Math.PI) / 180;
  const worldX = origin.x * 100 - 50 - start.x * 100;
  const worldY = origin.y * height - height / 2 - start.y * height;
  const localX = (worldX * Math.cos(startRadians) + worldY * Math.sin(startRadians)) / start.scale;
  const localY = (-worldX * Math.sin(startRadians) + worldY * Math.cos(startRadians)) / start.scale;
  const nextX = (localX * Math.cos(nextRadians) - localY * Math.sin(nextRadians)) * scale;
  const nextY = (localX * Math.sin(nextRadians) + localY * Math.cos(nextRadians)) * scale;
  return constrainOverlay({
    scale,
    rotation,
    x: (current.x * 100 - 50 - nextX) / 100,
    y: (current.y * height - height / 2 - nextY) / height,
  });
}
