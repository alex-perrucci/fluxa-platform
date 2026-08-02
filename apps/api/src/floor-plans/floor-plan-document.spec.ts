import { BadRequestException } from '@nestjs/common';
import {
  emptyFloorPlanDocument,
  floorPlanTableIds,
  validateFloorPlanDocument,
} from './floor-plan-document';

describe('floor plan document', () => {
  it('accepts an empty document', () => {
    expect(validateFloorPlanDocument(emptyFloorPlanDocument())).toEqual(
      emptyFloorPlanDocument(),
    );
  });

  it('normalizes text and returns referenced table ids', () => {
    const document = validateFloorPlanDocument({
      schemaVersion: 1,
      width: 1200,
      height: 800,
      gridSize: 20,
      elements: [
        {
          id: 'label-1',
          type: 'TEXT',
          x: 20,
          y: 20,
          width: 180,
          height: 40,
          rotation: 0,
          text: '  Ingresso  ',
          fontSize: 20,
        },
        {
          id: 'table-1',
          type: 'TABLE',
          x: 100,
          y: 100,
          width: 100,
          height: 80,
          rotation: 15,
          diningTableId: '11111111-1111-4111-8111-111111111111',
          tableShape: 'RECTANGLE',
        },
      ],
    });

    expect(document.elements[0]).toMatchObject({ text: 'Ingresso' });
    expect(floorPlanTableIds(document)).toEqual([
      '11111111-1111-4111-8111-111111111111',
    ]);
  });

  it('rejects duplicate table references', () => {
    const table = {
      type: 'TABLE',
      x: 100,
      y: 100,
      width: 100,
      height: 80,
      rotation: 0,
      diningTableId: '11111111-1111-4111-8111-111111111111',
      tableShape: 'ROUND',
    } as const;

    expect(() =>
      validateFloorPlanDocument({
        schemaVersion: 1,
        width: 1200,
        height: 800,
        gridSize: 20,
        elements: [
          { ...table, id: 'table-1' },
          { ...table, id: 'table-2', x: 300 },
        ],
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects unsupported element types', () => {
    expect(() =>
      validateFloorPlanDocument({
        schemaVersion: 1,
        width: 1200,
        height: 800,
        gridSize: 20,
        elements: [
          {
            id: 'image-1',
            type: 'IMAGE',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
          },
        ],
      }),
    ).toThrow(BadRequestException);
  });
});
