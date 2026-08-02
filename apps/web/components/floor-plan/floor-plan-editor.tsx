'use client';

import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ControlCenterNotification } from '@/components/control-center/notification';
import { StatusBadge } from '@/components/control-center/status-badge';
import {
  moveElement,
  resizeElement,
  rotateElement,
  snap,
  type Point,
} from '@/lib/floor-plan/geometry';
import type {
  FloorPlanDocument,
  FloorPlanElement,
  FloorPlanElementType,
  FloorPlanLocation,
  FloorPlanView,
} from '@/lib/floor-plan/types';

type EditorTool = 'SELECT' | FloorPlanElementType;
type InteractionMode = 'MOVE' | 'RESIZE' | 'ROTATE';

interface Interaction {
  pointerId: number;
  mode: InteractionMode;
  elementId: string;
  start: Point;
  original: FloorPlanElement;
  snapshot: FloorPlanDocument;
}

interface Props {
  mode: 'merchant' | 'platform';
  organizationId?: string;
  locations: FloorPlanLocation[];
  initialView: FloorPlanView;
}

const tools: Array<{ value: EditorTool; label: string }> = [
  { value: 'SELECT', label: 'Seleziona' },
  { value: 'WALL', label: 'Parete' },
  { value: 'RECTANGLE', label: 'Rettangolo' },
  { value: 'ELLIPSE', label: 'Ellisse' },
  { value: 'TEXT', label: 'Testo' },
  { value: 'TABLE', label: 'Tavolo' },
];

function responseMessage(value: unknown, fallback: string): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  ) {
    return value.message;
  }
  return fallback;
}

function defaultElement(
  type: FloorPlanElementType,
  point: Point,
  gridSize: number,
  diningTableId: string,
): FloorPlanElement {
  const base: FloorPlanElement = {
    id: crypto.randomUUID(),
    type,
    x: snap(point.x, gridSize),
    y: snap(point.y, gridSize),
    width: 160,
    height: 100,
    rotation: 0,
  };

  if (type === 'WALL') return { ...base, width: 240, height: 16 };
  if (type === 'TEXT') {
    return { ...base, height: 48, text: 'Nuovo testo', fontSize: 24 };
  }
  if (type === 'TABLE') {
    return {
      ...base,
      width: 120,
      height: 90,
      diningTableId,
      tableShape: 'RECTANGLE',
    };
  }
  return base;
}

function floorPlanEndpoint(
  mode: Props['mode'],
  organizationId: string | undefined,
  locationId: string,
) {
  if (mode === 'platform') {
    return `/api/control-center/platform/organizations/${organizationId}/locations/${locationId}/floor-plan`;
  }
  return `/api/control-center/merchant/floor-plans/${locationId}`;
}

export function FloorPlanEditor({
  mode,
  organizationId,
  locations,
  initialView,
}: Props) {
  const [locationId, setLocationId] = useState(initialView.plan.locationId);
  const [view, setView] = useState(initialView);
  const [planDocument, setPlanDocument] = useState(initialView.draft.document);
  const [tool, setTool] = useState<EditorTool>('SELECT');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState(
    initialView.tables.find((table) => table.status === 'ACTIVE')?.id ?? '',
  );
  const [history, setHistory] = useState<FloorPlanDocument[]>([]);
  const [future, setFuture] = useState<FloorPlanDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);

  const selected = useMemo(
    () =>
      planDocument.elements.find((element) => element.id === selectedId) ??
      null,
    [planDocument.elements, selectedId],
  );
  const activeTables = useMemo(
    () => view.tables.filter((table) => table.status === 'ACTIVE'),
    [view.tables],
  );
  const tableById = useMemo(
    () => new Map(view.tables.map((table) => [table.id, table])),
    [view.tables],
  );
  const placedTableIds = useMemo(
    () =>
      new Set(
        planDocument.elements.flatMap((element) =>
          element.type === 'TABLE' && element.diningTableId
            ? [element.diningTableId]
            : [],
        ),
      ),
    [planDocument.elements],
  );

  function pointFromEvent(event: ReactPointerEvent<SVGElement>): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * planDocument.width,
      y: ((event.clientY - rect.top) / rect.height) * planDocument.height,
    };
  }

  function commit(next: FloorPlanDocument) {
    setHistory((current) => [...current.slice(-49), planDocument]);
    setFuture([]);
    setPlanDocument(next);
    setDirty(true);
  }

  function replaceElement(
    elementId: string,
    updater: (element: FloorPlanElement) => FloorPlanElement,
    withHistory = true,
  ) {
    const next = {
      ...planDocument,
      elements: planDocument.elements.map((element) =>
        element.id === elementId ? updater(element) : element,
      ),
    };
    if (withHistory) commit(next);
    else {
      setPlanDocument(next);
      setDirty(true);
    }
  }

  function addElement(event: ReactPointerEvent<SVGElement>) {
    if (tool === 'SELECT') {
      setSelectedId(null);
      return;
    }
    if (tool === 'TABLE') {
      if (!selectedTableId) {
        setError('Seleziona un tavolo operativo prima di inserirlo.');
        return;
      }
      if (placedTableIds.has(selectedTableId)) {
        setError('Il tavolo selezionato è già presente nella piantina.');
        return;
      }
    }

    const element = defaultElement(
      tool,
      pointFromEvent(event),
      planDocument.gridSize,
      selectedTableId,
    );
    commit({
      ...planDocument,
      elements: [...planDocument.elements, element],
    });
    setSelectedId(element.id);
    setTool('SELECT');
  }

  function beginInteraction(
    event: ReactPointerEvent<SVGElement>,
    element: FloorPlanElement,
    interactionMode: InteractionMode,
  ) {
    event.stopPropagation();
    setSelectedId(element.id);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode: interactionMode,
      elementId: element.id,
      start: pointFromEvent(event),
      original: element,
      snapshot: planDocument,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveInteraction(event: ReactPointerEvent<SVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const delta = {
      x: point.x - interaction.start.x,
      y: point.y - interaction.start.y,
    };
    replaceElement(
      interaction.elementId,
      () => {
        if (interaction.mode === 'MOVE') {
          return moveElement(
            interaction.original,
            delta,
            planDocument.gridSize,
            planDocument.width,
            planDocument.height,
          );
        }
        if (interaction.mode === 'RESIZE') {
          return resizeElement(
            interaction.original,
            delta,
            planDocument.gridSize,
            planDocument.width,
            planDocument.height,
          );
        }
        return rotateElement(
          interaction.original,
          point,
          planDocument.gridSize,
        );
      },
      false,
    );
  }

  function endInteraction(event: ReactPointerEvent<SVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    setHistory((current) => [...current.slice(-49), interaction.snapshot]);
    setFuture([]);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [planDocument, ...current].slice(0, 50));
    setHistory((current) => current.slice(0, -1));
    setPlanDocument(previous);
    setSelectedId(null);
    setDirty(true);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current.slice(-49), planDocument]);
    setFuture((current) => current.slice(1));
    setPlanDocument(next);
    setSelectedId(null);
    setDirty(true);
  }

  function removeSelected() {
    if (!selectedId) return;
    commit({
      ...planDocument,
      elements: planDocument.elements.filter(
        (element) => element.id !== selectedId,
      ),
    });
    setSelectedId(null);
  }

  async function loadLocation(nextLocationId: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        floorPlanEndpoint(mode, organizationId, nextLocationId),
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(responseMessage(body, 'Piantina non disponibile.'));
      }
      const nextView = body as FloorPlanView;
      setLocationId(nextLocationId);
      setView(nextView);
      setPlanDocument(nextView.draft.document);
      setSelectedId(null);
      setSelectedTableId(
        nextView.tables.find((table) => table.status === 'ACTIVE')?.id ?? '',
      );
      setHistory([]);
      setFuture([]);
      setDirty(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Piantina non disponibile.',
      );
    } finally {
      setPending(false);
    }
  }

  async function persist(action: 'draft' | 'publish') {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${floorPlanEndpoint(mode, organizationId, locationId)}/${action}`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            action === 'draft'
              ? { revision: view.draft.revision, document: planDocument }
              : { revision: view.draft.revision },
          ),
        },
      );
      const body = (await response.json()) as unknown;
      if (!response.ok) {
        throw new Error(
          responseMessage(
            body,
            action === 'draft'
              ? 'Bozza non salvata.'
              : 'Piantina non pubblicata.',
          ),
        );
      }
      const nextView = body as FloorPlanView;
      setView(nextView);
      setPlanDocument(nextView.draft.document);
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setMessage(
        action === 'draft'
          ? `Bozza v${nextView.draft.versionNumber} salvata.`
          : `Versione v${nextView.published?.versionNumber ?? ''} pubblicata.`,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Operazione non completata.',
      );
    } finally {
      setPending(false);
    }
  }

  function updateDocumentField(
    field: 'width' | 'height' | 'gridSize',
    value: number,
  ) {
    commit({ ...planDocument, [field]: value });
  }

  return (
    <div className="floor-plan-editor">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Operazione non completata"
      />
      <ControlCenterNotification
        message={message}
        onDismiss={() => setMessage(null)}
        title="Piantina aggiornata"
      />

      <div className="floor-plan-topbar">
        <label className="field">
          <span>Location</span>
          <select
            disabled={pending || dirty}
            onChange={(event) => void loadLocation(event.target.value)}
            value={locationId}
          >
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} · {location.code}
              </option>
            ))}
          </select>
        </label>
        <div className="floor-plan-version-state">
          <StatusBadge status="DRAFT" />
          <span>
            v{view.draft.versionNumber} · revisione {view.draft.revision}
          </span>
          {view.published ? (
            <span>Pubblicata v{view.published.versionNumber}</span>
          ) : (
            <span>Nessuna versione pubblicata</span>
          )}
        </div>
        <div className="floor-plan-actions">
          <button
            className="button-secondary"
            disabled={pending || !history.length}
            onClick={undo}
            type="button"
          >
            Annulla
          </button>
          <button
            className="button-secondary"
            disabled={pending || !future.length}
            onClick={redo}
            type="button"
          >
            Ripeti
          </button>
          <button
            className="button-secondary"
            disabled={pending || !dirty}
            onClick={() => void persist('draft')}
            type="button"
          >
            Salva bozza
          </button>
          <button
            className="button-primary"
            disabled={pending || dirty}
            onClick={() => void persist('publish')}
            type="button"
          >
            Pubblica
          </button>
        </div>
      </div>

      <div className="floor-plan-workspace">
        <aside className="floor-plan-sidebar">
          <strong>Strumenti</strong>
          <div className="floor-plan-tools">
            {tools.map((item) => (
              <button
                className={tool === item.value ? 'active' : ''}
                key={item.value}
                onClick={() => setTool(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>

          {tool === 'TABLE' ? (
            <label className="field">
              <span>Tavolo operativo</span>
              <select
                onChange={(event) => setSelectedTableId(event.target.value)}
                value={selectedTableId}
              >
                <option value="">Seleziona tavolo</option>
                {activeTables.map((table) => (
                  <option
                    disabled={placedTableIds.has(table.id)}
                    key={table.id}
                    value={table.id}
                  >
                    {table.areaName} · {table.code} · {table.capacity} posti
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <strong>Tela</strong>
          <div className="floor-plan-properties">
            <label className="field">
              <span>Larghezza</span>
              <input
                max={5000}
                min={400}
                onChange={(event) =>
                  updateDocumentField('width', Number(event.target.value))
                }
                type="number"
                value={planDocument.width}
              />
            </label>
            <label className="field">
              <span>Altezza</span>
              <input
                max={5000}
                min={300}
                onChange={(event) =>
                  updateDocumentField('height', Number(event.target.value))
                }
                type="number"
                value={planDocument.height}
              />
            </label>
            <label className="field">
              <span>Griglia</span>
              <input
                max={100}
                min={5}
                onChange={(event) =>
                  updateDocumentField('gridSize', Number(event.target.value))
                }
                type="number"
                value={planDocument.gridSize}
              />
            </label>
          </div>
        </aside>

        <main className="floor-plan-canvas-shell">
          <svg
            className="floor-plan-canvas"
            onPointerMove={moveInteraction}
            onPointerUp={endInteraction}
            ref={svgRef}
            viewBox={`0 0 ${planDocument.width} ${planDocument.height}`}
          >
            <defs>
              <pattern
                height={planDocument.gridSize}
                id="floor-plan-grid"
                patternUnits="userSpaceOnUse"
                width={planDocument.gridSize}
              >
                <path
                  className="floor-plan-grid-line"
                  d={`M ${planDocument.gridSize} 0 L 0 0 0 ${planDocument.gridSize}`}
                />
              </pattern>
            </defs>
            <rect
              className="floor-plan-background"
              height={planDocument.height}
              onPointerDown={addElement}
              width={planDocument.width}
              x={0}
              y={0}
            />
            <rect
              fill="url(#floor-plan-grid)"
              height={planDocument.height}
              pointerEvents="none"
              width={planDocument.width}
              x={0}
              y={0}
            />

            {planDocument.elements.map((element) => {
              const centerX = element.x + element.width / 2;
              const centerY = element.y + element.height / 2;
              const transform = `rotate(${element.rotation} ${centerX} ${centerY})`;
              const table = element.diningTableId
                ? tableById.get(element.diningTableId)
                : null;

              return (
                <g
                  className={
                    selectedId === element.id
                      ? 'floor-plan-element selected'
                      : 'floor-plan-element'
                  }
                  key={element.id}
                  onPointerDown={(event) =>
                    beginInteraction(event, element, 'MOVE')
                  }
                  transform={transform}
                >
                  {element.type === 'ELLIPSE' ||
                  (element.type === 'TABLE' &&
                    element.tableShape === 'ROUND') ? (
                    <ellipse
                      className={`floor-plan-shape type-${element.type.toLowerCase()}`}
                      cx={centerX}
                      cy={centerY}
                      rx={element.width / 2}
                      ry={element.height / 2}
                    />
                  ) : (
                    <rect
                      className={`floor-plan-shape type-${element.type.toLowerCase()}`}
                      height={element.height}
                      rx={element.type === 'TABLE' ? 16 : 4}
                      width={element.width}
                      x={element.x}
                      y={element.y}
                    />
                  )}

                  {element.type === 'TEXT' ? (
                    <text
                      className="floor-plan-text"
                      fontSize={element.fontSize ?? 24}
                      x={element.x + 12}
                      y={element.y + element.height / 2}
                    >
                      {element.text}
                    </text>
                  ) : null}

                  {element.type === 'TABLE' ? (
                    <text
                      className="floor-plan-table-label"
                      textAnchor="middle"
                      x={centerX}
                      y={centerY}
                    >
                      <tspan x={centerX}>{table?.code ?? 'Tavolo'}</tspan>
                      <tspan dy="20" x={centerX}>
                        {table?.capacity ?? 0} posti
                      </tspan>
                    </text>
                  ) : null}

                  {selectedId === element.id ? (
                    <>
                      <rect
                        className="floor-plan-selection"
                        height={element.height}
                        pointerEvents="none"
                        width={element.width}
                        x={element.x}
                        y={element.y}
                      />
                      <circle
                        className="floor-plan-handle resize"
                        cx={element.x + element.width}
                        cy={element.y + element.height}
                        onPointerDown={(event) =>
                          beginInteraction(event, element, 'RESIZE')
                        }
                        r={10}
                      />
                      <circle
                        className="floor-plan-handle rotate"
                        cx={centerX}
                        cy={element.y - 28}
                        onPointerDown={(event) =>
                          beginInteraction(event, element, 'ROTATE')
                        }
                        r={10}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </main>

        <aside className="floor-plan-sidebar properties">
          <strong>Proprietà</strong>
          {selected ? (
            <div className="floor-plan-properties">
              <span className="muted">{selected.type}</span>
              {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                (field) => (
                  <label className="field" key={field}>
                    <span>{field}</span>
                    <input
                      onChange={(event) =>
                        replaceElement(selected.id, (element) => ({
                          ...element,
                          [field]: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={selected[field]}
                    />
                  </label>
                ),
              )}
              {selected.type === 'TEXT' ? (
                <>
                  <label className="field">
                    <span>Testo</span>
                    <textarea
                      maxLength={240}
                      onChange={(event) =>
                        replaceElement(selected.id, (element) => ({
                          ...element,
                          text: event.target.value,
                        }))
                      }
                      value={selected.text ?? ''}
                    />
                  </label>
                  <label className="field">
                    <span>Dimensione testo</span>
                    <input
                      max={120}
                      min={8}
                      onChange={(event) =>
                        replaceElement(selected.id, (element) => ({
                          ...element,
                          fontSize: Number(event.target.value),
                        }))
                      }
                      type="number"
                      value={selected.fontSize ?? 24}
                    />
                  </label>
                </>
              ) : null}
              {selected.type === 'TABLE' ? (
                <label className="field">
                  <span>Forma tavolo</span>
                  <select
                    onChange={(event) =>
                      replaceElement(selected.id, (element) => ({
                        ...element,
                        tableShape: event.target.value as 'RECTANGLE' | 'ROUND',
                      }))
                    }
                    value={selected.tableShape ?? 'RECTANGLE'}
                  >
                    <option value="RECTANGLE">Rettangolare</option>
                    <option value="ROUND">Rotondo</option>
                  </select>
                </label>
              ) : null}
              <button
                className="button-danger"
                onClick={removeSelected}
                type="button"
              >
                Elimina elemento
              </button>
            </div>
          ) : (
            <p className="muted">
              Seleziona un elemento per modificarne posizione, dimensioni e
              rotazione.
            </p>
          )}

          <strong>Versioni</strong>
          <div className="floor-plan-version-list">
            {view.versions.map((version) => (
              <div key={version.id}>
                <StatusBadge status={version.status} />
                <span>
                  v{version.versionNumber} · rev. {version.revision}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
