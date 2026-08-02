export type FloorPlanElementType =
  | 'WALL'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'TEXT'
  | 'TABLE';

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

export interface FloorPlanVersion {
  id: string;
  floorPlanId: string;
  versionNumber: number;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED';
  document: FloorPlanDocument;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanVersionSummary {
  id: string;
  versionNumber: number;
  revision: number;
  status: 'DRAFT' | 'PUBLISHED';
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FloorPlanTable {
  id: string;
  areaId: string;
  areaName: string;
  code: string;
  name: string;
  capacity: number;
  status: 'ACTIVE' | 'INACTIVE';
}

export interface FloorPlanView {
  plan: {
    id: string;
    organizationId: string;
    locationId: string;
    name: string;
    publishedVersionId: string | null;
    createdAt: string;
    updatedAt: string;
  };
  draft: FloorPlanVersion;
  published: FloorPlanVersion | null;
  versions: FloorPlanVersionSummary[];
  tables: FloorPlanTable[];
}

export interface FloorPlanLocation {
  id: string;
  code: string;
  name: string;
  city: string;
  timezone: string;
}
