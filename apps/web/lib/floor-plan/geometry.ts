import type { FloorPlanElement } from './types';

export interface Point {
  x: number;
  y: number;
}

export function snap(value: number, gridSize: number): number {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(gridSize) || gridSize <= 0) return value;
  return Math.round(value / gridSize) * gridSize;
}

export function moveElement(
  element: FloorPlanElement,
  delta: Point,
  gridSize: number,
  canvasWidth?: number,
  canvasHeight?: number,
): FloorPlanElement {
  const x = snap(element.x + delta.x, gridSize);
  const y = snap(element.y + delta.y, gridSize);

  return {
    ...element,
    x:
      canvasWidth === undefined
        ? x
        : clamp(x, 0, Math.max(0, canvasWidth - element.width)),
    y:
      canvasHeight === undefined
        ? y
        : clamp(y, 0, Math.max(0, canvasHeight - element.height)),
  };
}

export function resizeElement(
  element: FloorPlanElement,
  delta: Point,
  gridSize: number,
  canvasWidth?: number,
  canvasHeight?: number,
): FloorPlanElement {
  const width = Math.max(8, snap(element.width + delta.x, gridSize));
  const height = Math.max(8, snap(element.height + delta.y, gridSize));

  return {
    ...element,
    width:
      canvasWidth === undefined
        ? width
        : Math.min(width, Math.max(8, canvasWidth - element.x)),
    height:
      canvasHeight === undefined
        ? height
        : Math.min(height, Math.max(8, canvasHeight - element.y)),
  };
}

export function rotateElement(
  element: FloorPlanElement,
  pointer: Point,
  gridSize?: number,
): FloorPlanElement {
  void gridSize;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const radians = Math.atan2(pointer.y - centerY, pointer.x - centerX);
  const degrees = (radians * 180) / Math.PI + 90;
  return { ...element, rotation: normalizeRotation(Math.round(degrees)) };
}

export function normalizeRotation(value: number): number {
  const normalized = value % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

export function elementCenter(element: FloorPlanElement): Point {
  return {
    x: element.x + element.width / 2,
    y: element.y + element.height / 2,
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
