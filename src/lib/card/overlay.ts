import { ASPECTS, type Aspect, type OverlayTransform } from "./draw";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeRotation(degrees: number) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

/** Keep the complete template inside the card, including its footer. */
export function constrainOverlay(value: OverlayTransform, aspect: Aspect): OverlayTransform {
  const height = ASPECTS[aspect].h / 10.8;
  const rotation = normalizeRotation(value.rotation);
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const contentWidth = 88;
  const contentHeight = height - 16;
  const fit = Math.min(1,
    90 / (contentWidth * cos + contentHeight * sin),
    (height - 10) / (contentWidth * sin + contentHeight * cos));
  const scale = clamp(value.scale, 0.35, fit);

  const corners = [[6, 9], [94, 9], [94, height - 7], [6, height - 7]]
    .map(([x, y]) => {
      const dx = (x - 50) * scale;
      const dy = (y - height / 2) * scale;
      return {
        x: 50 + dx * Math.cos(radians) - dy * Math.sin(radians),
        y: height / 2 + dx * Math.sin(radians) + dy * Math.cos(radians),
      };
    });
  const minX = Math.min(...corners.map(point => point.x));
  const maxX = Math.max(...corners.map(point => point.x));
  const minY = Math.min(...corners.map(point => point.y));
  const maxY = Math.max(...corners.map(point => point.y));
  return {
    scale,
    rotation,
    x: clamp(value.x, (5 - minX) / 100, (95 - maxX) / 100),
    y: clamp(value.y, (5 - minY) / height, (height - 5 - maxY) / height),
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
  }, aspect);
}
