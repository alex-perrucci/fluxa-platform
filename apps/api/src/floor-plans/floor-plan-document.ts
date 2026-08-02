import { BadRequestException } from '@nestjs/common';

export const FLOOR_PLAN_SCHEMA_VERSION = 1;
export const FLOOR_PLAN_MAX_ELEMENTS = 500;

export type FloorPlanElementType =
  'WALL' | 'RECTANGLE' | 'ELLIPSE' | 'TEXT' | 'TABLE';

export interface FloorPlanElement {
  id: string;
  type: FloorPlanElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  text?: string;
  fontSize?: number;
  diningTableId?: string;
  tableShape?: 'RECTANGLE' | 'ROUND';
}

export interface FloorPlanDocument {
  schemaVersion: 1;
  width: number;
  height: number;
  gridSize: number;
  elements: FloorPlanElement[];
}

export function emptyFloorPlanDocument(): FloorPlanDocument {
  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    width: 1200,
    height: 800,
    gridSize: 20,
    elements: [],
  };
}

export function validateFloorPlanDocument(value: unknown): FloorPlanDocument {
  if (!isRecord(value)) {
    invalid('Il documento della piantina non è valido.');
  }

  if (value.schemaVersion !== FLOOR_PLAN_SCHEMA_VERSION) {
    invalid('Versione del documento della piantina non supportata.');
  }

  const width = finiteNumber(value.width, 'larghezza');
  const height = finiteNumber(value.height, 'altezza');
  const gridSize = finiteNumber(value.gridSize, 'griglia');

  if (width < 400 || width > 5000 || height < 300 || height > 5000) {
    invalid('La tela deve essere compresa tra 400×300 e 5000×5000.');
  }

  if (gridSize < 5 || gridSize > 100) {
    invalid('La griglia deve essere compresa tra 5 e 100.');
  }

  if (!Array.isArray(value.elements)) {
    invalid('Gli elementi della piantina devono essere una lista.');
  }

  if (value.elements.length > FLOOR_PLAN_MAX_ELEMENTS) {
    invalid(
      `La piantina può contenere al massimo ${FLOOR_PLAN_MAX_ELEMENTS} elementi.`,
    );
  }

  const ids = new Set<string>();
  const tableIds = new Set<string>();
  const elements = value.elements.map((element, index) => {
    const normalized = validateElement(element, index, width, height);
    if (ids.has(normalized.id)) {
      invalid(`L'elemento ${normalized.id} è duplicato.`);
    }
    ids.add(normalized.id);

    if (normalized.type === 'TABLE' && normalized.diningTableId) {
      if (tableIds.has(normalized.diningTableId)) {
        invalid('Ogni tavolo operativo può comparire una sola volta.');
      }
      tableIds.add(normalized.diningTableId);
    }

    return normalized;
  });

  return {
    schemaVersion: FLOOR_PLAN_SCHEMA_VERSION,
    width,
    height,
    gridSize,
    elements,
  };
}

export function floorPlanTableIds(document: FloorPlanDocument): string[] {
  return document.elements.flatMap((element) =>
    element.type === 'TABLE' && element.diningTableId
      ? [element.diningTableId]
      : [],
  );
}

function validateElement(
  value: unknown,
  index: number,
  canvasWidth: number,
  canvasHeight: number,
): FloorPlanElement {
  if (!isRecord(value)) {
    invalid(`L'elemento ${index + 1} non è valido.`);
  }

  const id = stringValue(value.id, `elemento ${index + 1}`);
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) {
    invalid(`L'identificativo dell'elemento ${index + 1} non è valido.`);
  }

  const type = value.type;
  if (!isElementType(type)) {
    invalid(`Il tipo dell'elemento ${index + 1} non è supportato.`);
  }

  const x = finiteNumber(value.x, `x dell'elemento ${index + 1}`);
  const y = finiteNumber(value.y, `y dell'elemento ${index + 1}`);
  const width = finiteNumber(
    value.width,
    `larghezza dell'elemento ${index + 1}`,
  );
  const height = finiteNumber(
    value.height,
    `altezza dell'elemento ${index + 1}`,
  );
  const rotation = finiteNumber(
    value.rotation,
    `rotazione dell'elemento ${index + 1}`,
  );

  if (width < 8 || height < 8 || width > 3000 || height > 3000) {
    invalid(`Le dimensioni dell'elemento ${index + 1} non sono valide.`);
  }

  if (x < -width || y < -height || x > canvasWidth || y > canvasHeight) {
    invalid(`L'elemento ${index + 1} è fuori dalla tela.`);
  }

  if (rotation < -3600 || rotation > 3600) {
    invalid(`La rotazione dell'elemento ${index + 1} non è valida.`);
  }

  const base: FloorPlanElement = {
    id,
    type,
    x,
    y,
    width,
    height,
    rotation,
  };

  if (type === 'TEXT') {
    const text = stringValue(value.text, `testo dell'elemento ${index + 1}`);
    if (text.length > 240) {
      invalid('Un testo della piantina non può superare 240 caratteri.');
    }
    const fontSize = finiteNumber(
      value.fontSize,
      `dimensione testo dell'elemento ${index + 1}`,
    );
    if (fontSize < 8 || fontSize > 120) {
      invalid('La dimensione del testo deve essere compresa tra 8 e 120.');
    }
    return { ...base, text, fontSize };
  }

  if (type === 'TABLE') {
    const diningTableId = stringValue(
      value.diningTableId,
      `tavolo dell'elemento ${index + 1}`,
    );
    if (!isUuid(diningTableId)) {
      invalid(`Il tavolo dell'elemento ${index + 1} non è valido.`);
    }
    const tableShape = value.tableShape;
    if (tableShape !== 'RECTANGLE' && tableShape !== 'ROUND') {
      invalid(`La forma del tavolo ${index + 1} non è valida.`);
    }
    return { ...base, diningTableId, tableShape };
  }

  return base;
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    invalid(`Il campo ${field} deve essere numerico.`);
  }
  return value;
}

function stringValue(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    invalid(`Il campo ${field} è obbligatorio.`);
  }
  return value.trim();
}

function isElementType(value: unknown): value is FloorPlanElementType {
  return (
    value === 'WALL' ||
    value === 'RECTANGLE' ||
    value === 'ELLIPSE' ||
    value === 'TEXT' ||
    value === 'TABLE'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function invalid(message: string): never {
  throw new BadRequestException({
    code: 'INVALID_FLOOR_PLAN_DOCUMENT',
    message,
  });
}
