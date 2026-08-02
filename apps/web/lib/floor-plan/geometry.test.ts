import { describe, expect, it } from 'vitest';
import {
  moveElement,
  normalizeRotation,
  resizeElement,
  rotateElement,
  snap,
} from './geometry';
import type { FloorPlanElement } from './types';

const element: FloorPlanElement = {
  id: 'shape-1',
  type: 'RECTANGLE',
  x: 100,
  y: 100,
  width: 120,
  height: 80,
  rotation: 0,
};

describe('floor plan geometry', () => {
  it('snaps values to the configured grid', () => {
    expect(snap(33, 20)).toBe(40);
    expect(snap(29, 20)).toBe(20);
  });

  it('moves and resizes an element on the grid', () => {
    expect(moveElement(element, { x: 27, y: -11 }, 20)).toMatchObject({
      x: 120,
      y: 80,
    });
    expect(resizeElement(element, { x: 35, y: 25 }, 20)).toMatchObject({
      width: 160,
      height: 100,
    });
  });

  it('normalizes negative rotations', () => {
    expect(normalizeRotation(-45)).toBe(315);
    expect(normalizeRotation(405)).toBe(45);
  });

  it('rotates around the element center', () => {
    expect(rotateElement(element, { x: 160, y: 40 }).rotation).toBe(0);
    expect(rotateElement(element, { x: 260, y: 140 }).rotation).toBe(90);
  });
});
