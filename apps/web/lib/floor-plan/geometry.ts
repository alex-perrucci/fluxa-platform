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
): FloorPlanElement {
  return {
    ...element,
    x: snap(element.x + delta.x, gridSize),
    y: snap(element.y + delta.y, gridSize),
  };
}

export function resizeElement(
  element: FloorPlanElement,
  delta: Point,
  gridSize: number,
): FloorPlanElement {
  return {
    ...element,
    width: Math.max(8, snap(element.width + delta.x, gridSize)),
    height: Math.max(8, snap(element.height + delta.y, gridSize)),
  };
}

export function rotateElement(
  element: FloorPlanElement,
  pointer: Point,
): FloorPlanElement {
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
