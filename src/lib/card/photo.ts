export type PhotoTransform = { zoom: number; x: number; y: number; rotation: number };

export type PhotoSize = { width: number; height: number };

/** A 1% floor is effectively unrestricted while keeping the image grabbable. */
export const MIN_PHOTO_ZOOM = 0.01;
export const MAX_PHOTO_ZOOM = 8;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function clampPhotoZoom(zoom: number) {
  return clamp(zoom, MIN_PHOTO_ZOOM, MAX_PHOTO_ZOOM);
}

export function normalizePhotoRotation(degrees: number) {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

export function photoSize(image: PhotoSize, frame: PhotoSize, zoom: number): PhotoSize {
  const base = Math.max(frame.width / image.width, frame.height / image.height);
  return { width: image.width * base * zoom, height: image.height * base * zoom };
}

/**
 * Move, scale, and rotate a photo while preserving the point under the fingers.
 *
 * x/y are alignment values: 0 pins the near edge, .5 centres the image, and 1
 * pins the far edge. The same representation works when an image is larger
 * than the frame and when it has been zoomed out to reveal black around it.
 */
export function pinchPhoto(
  start: PhotoTransform,
  image: PhotoSize,
  frame: PhotoSize,
  origin: { x: number; y: number },
  current: { x: number; y: number },
  ratio: number,
  rotationDelta = 0,
): PhotoTransform {
  const zoom = clampPhotoZoom(start.zoom * ratio);
  const rotation = normalizePhotoRotation(start.rotation + rotationDelta);
  const before = photoSize(image, frame, start.zoom);
  const after = photoSize(image, frame, zoom);
  const beforeLeft = -(before.width - frame.width) * start.x;
  const beforeTop = -(before.height - frame.height) * start.y;
  const beforeCenter = { x: beforeLeft + before.width / 2, y: beforeTop + before.height / 2 };
  const startRadians = (start.rotation * Math.PI) / 180;
  const nextRadians = (rotation * Math.PI) / 180;
  const worldX = origin.x - beforeCenter.x;
  const worldY = origin.y - beforeCenter.y;
  const sourceX = worldX * Math.cos(startRadians) + worldY * Math.sin(startRadians);
  const sourceY = -worldX * Math.sin(startRadians) + worldY * Math.cos(startRadians);
  const appliedRatio = after.width / before.width;
  const nextX = (sourceX * Math.cos(nextRadians) - sourceY * Math.sin(nextRadians)) * appliedRatio;
  const nextY = (sourceX * Math.sin(nextRadians) + sourceY * Math.cos(nextRadians)) * appliedRatio;
  const nextCenter = { x: current.x - nextX, y: current.y - nextY };

  function align(center: number, size: number, frameSize: number) {
    const slack = size - frameSize;
    return Math.abs(slack) > 0.5 ? clamp(-(center - size / 2) / slack, 0, 1) : 0.5;
  }

  return {
    zoom,
    rotation,
    x: align(nextCenter.x, after.width, frame.width),
    y: align(nextCenter.y, after.height, frame.height),
  };
}
