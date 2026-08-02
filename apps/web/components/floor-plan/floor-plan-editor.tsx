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
  const x = snap(point.x, gridSize);
  const y = snap(point.y, gridSize);
  const base = {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    width: 160,
    height: 100,
    rotation: 0,
  } satisfies FloorPlanElement;

  if (type === 'WALL') {
    return { ...base, width: 240, height: 16 };
  }
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

  function pointFromEvent(event: ReactPointerEvent<SVGSVGElement>): Point {
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

  function updateElement(
    elementId: string,
    updater: (element: FloorPlanElement) => FloorPlanElement,
    withHistory: boolean,
  ) {
    const next = {
      ...planDocument,
      elements: planDocument.elements.map((element) =>
        element.id === elementId ? updater(element) : element,
      ),
    };
    if (withHistory) {
      commit(next);
    } else {
      setPlanDocument(next);
      setDirty(true);
    }
  }

  function addElement(event: ReactPointerEvent<SVGSVGElement>) {
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

  function startInteraction(
    event: ReactPointerEvent<SVGGElement>,
    element: FloorPlanElement,
    modeValue: InteractionMode,
  ) {
    event.stopPropagation();
    svgRef.current?.setPointerCapture(event.pointerId);
    interactionRef.current = {
      pointerId: event.pointerId,
      mode: modeValue,
      elementId: element.id,
      start: pointFromSvgChildEvent(event),
      original: element,
      snapshot: planDocument,
    };
    setSelectedId(element.id);
  }

  function pointFromSvgChildEvent(event: ReactPointerEvent<SVGGElement>): Point {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * planDocument.width,
      y: ((event.clientY - rect.top) / rect.height) * planDocument.height,
    };
  }

  function moveInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    const point = pointFromEvent(event);
    const delta = {
      x: point.x - interaction.start.x,
      y: point.y - interaction.start.y,
    };

    updateElement(
      interaction.elementId,
      () => {
        if (interaction.mode === 'MOVE') {
          return moveElement(
            interaction.original,
            delta,
            planDocument.gridSize,
          );
        }
        if (interaction.mode === 'RESIZE') {
          return resizeElement(
            interaction.original,
            delta,
            planDocument.gridSize,
          );
        }
        return rotateElement(interaction.original, point);
      },
      false,
    );
  }

  function finishInteraction(event: ReactPointerEvent<SVGSVGElement>) {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interactionRef.current = null;
    svgRef.current?.releasePointerCapture(event.pointerId);
    setHistory((current) => [...current.slice(-49), interaction.snapshot]);
    setFuture([]);
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture((current) => [planDocument, ...current.slice(0, 49)]);
    setHistory((current) => current.slice(0, -1));
    setPlanDocument(previous);
    setDirty(true);
    setSelectedId(null);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setHistory((current) => [...current.slice(-49), planDocument]);
    setFuture((current) => current.slice(1));
    setPlanDocument(next);
    setDirty(true);
    setSelectedId(null);
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

  function patchSelected(patch: Partial<FloorPlanElement>) {
    if (!selectedId) return;
    updateElement(
      selectedId,
      (element) => ({ ...element, ...patch }),
      true,
    );
  }

  async function loadLocation(nextLocationId: string) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        floorPlanEndpoint(mode, organizationId, nextLocationId),
      );
      const body = (await response.json()) as FloorPlanView | unknown;
      if (!response.ok) {
        throw new Error(
          responseMessage(body, 'Piantina della location non disponibile.'),
        );
      }
      const nextView = body as FloorPlanView;
      setLocationId(nextLocationId);
      setView(nextView);
      setPlanDocument(nextView.draft.document);
      setSelectedTableId(
        nextView.tables.find((table) => table.status === 'ACTIVE')?.id ?? '',
      );
      setSelectedId(null);
      setHistory([]);
      setFuture([]);
      setDirty(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Piantina della location non disponibile.',
      );
    } finally {
      setPending(false);
    }
  }

  async function saveDraft() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${floorPlanEndpoint(mode, organizationId, locationId)}/draft`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            revision: view.draft.revision,
            document: planDocument,
          }),
        },
      );
      const body = (await response.json()) as FloorPlanView | unknown;
      if (!response.ok) {
        throw new Error(responseMessage(body, 'Bozza non salvata.'));
      }
      const nextView = body as FloorPlanView;
      setView(nextView);
      setPlanDocument(nextView.draft.document);
      setHistory([]);
      setFuture([]);
      setDirty(false);
      setMessage(`Bozza v${nextView.draft.versionNumber} salvata.`);
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : 'Bozza non salvata.',
      );
    } finally {
      setPending(false);
    }
  }

  async function publish() {
    if (dirty) {
      setError('Salva la bozza prima di pubblicarla.');
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch(
        `${floorPlanEndpoint(mode, organizationId, locationId)}/publish`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ revision: view.draft.revision }),
        },
      );
      const body = (await response.json()) as FloorPlanView | unknown;
      if (!response.ok) {
        throw new Error(responseMessage(body, 'Piantina non pubblicata.'));
      }
      const nextView = body as FloorPlanView;
      setView(nextView);
      setPlanDocument(nextView.draft.document);
      setHistory([]);
      setFuture([]);
      setSelectedId(null);
      setMessage(
        `Versione ${nextView.published?.versionNumber ?? ''} pubblicata.`,
      );
    } catch (publishError) {
      setError(
        publishError instanceof Error
          ? publishError.message
          : 'Piantina non pubblicata.',
      );
    } finally {
      setPending(false);
    }
  }

  function updateCanvas(field: 'width' | 'height' | 'gridSize', value: number) {
    const limits =
      field === 'gridSize'
        ? { min: 5, max: 100 }
        : field === 'width'
          ? { min: 400, max: 5000 }
          : { min: 300, max: 5000 };
    commit({
      ...planDocument,
      [field]: Math.min(limits.max, Math.max(limits.min, value || limits.min)),
    });
  }

  return (
    <div className="floor-plan-editor">
      <ControlCenterNotification
        message={error}
        onDismiss={() => setError(null)}
        title="Piantina non aggiornata"
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
            disabled={pending}
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
          <StatusBadge status={dirty ? 'UNSAVED' : 'DRAFT'} />
          <span>
            Bozza v{view.draft.versionNumber} · revisione {view.draft.revision}
          </span>
          <small>
            Pubblicata:{' '}
            {view.published ? `v${view.published.versionNumber}` : 'nessuna'}
          </small>
        </div>
        <div className="floor-plan-actions">
          <button
            className="button-secondary"
            disabled={pending || !dirty}
            onClick={() => void saveDraft()}
            type="button"
          >
            Salva bozza
          </button>
          <button
            className="button-primary"
            disabled={pending || dirty}
            onClick={() => void publish()}
            type="button"
          >
            Pubblica versione
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

          <div className="floor-plan-history-actions">
            <button disabled={!history.length} onClick={undo} type="button">
              Annulla
            </button>
            <button disabled={!future.length} onClick={redo} type="button">
              Ripristina
            </button>
          </div>

          <strong>Tela</strong>
          <div className="floor-plan-property-grid">
            <label className="field">
              <span>Larghezza</span>
              <input
                max={5000}
                min={400}
                onChange={(event) =>
                  updateCanvas('width', Number(event.target.value))
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
                  updateCanvas('height', Number(event.target.value))
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
                  updateCanvas('gridSize', Number(event.target.value))
                }
                type="number"
                value={planDocument.gridSize}
              />
            </label>
          </div>

          {selected ? (
            <>
              <strong>Elemento selezionato</strong>
              <div className="floor-plan-property-grid">
                {(['x', 'y', 'width', 'height', 'rotation'] as const).map(
                  (field) => (
                    <label className="field" key={field}>
                      <span>{field}</span>
                      <input
                        onChange={(event) =>
                          patchSelected({
                            [field]: Number(event.target.value),
                          })
                        }
                        type="number"
                        value={selected[field]}
                      />
                    </label>
                  ),
                )}
                {selected.type === 'TEXT' ? (
                  <>
                    <label className="field span-2">
                      <span>Testo</span>
                      <input
                        maxLength={240}
                        onChange={(event) =>
                          patchSelected({ text: event.target.value })
                        }
                        value={selected.text ?? ''}
                      />
                    </label>
                    <label className="field">
                      <span>Dimensione</span>
                      <input
                        max={120}
                        min={8}
                        onChange={(event) =>
                          patchSelected({
                            fontSize: Number(event.target.value),
                          })
                        }
                        type="number"
                        value={selected.fontSize ?? 24}
                      />
                    </label>
                  </>
                ) : null}
                {selected.type === 'TABLE' ? (
                  <label className="field span-2">
                    <span>Forma tavolo</span>
                    <select
                      onChange={(event) =>
                        patchSelected({
                          tableShape: event.target.value as
                            | 'RECTANGLE'
                            | 'ROUND',
                        })
                      }
                      value={selected.tableShape ?? 'RECTANGLE'}
                    >
                      <option value="RECTANGLE">Rettangolare</option>
                      <option value="ROUND">Rotondo</option>
                    </select>
                  </label>
                ) : null}
              </div>
              <button
                className="button-danger"
                onClick={removeSelected}
                type="button"
              >
                Elimina elemento
              </button>
            </>
          ) : (
            <p className="muted">
              Seleziona un elemento per modificarne posizione, dimensioni e
              rotazione.
            </p>
          )}
        </aside>

        <div className="floor-plan-canvas-shell">
          <svg
            aria-label="Editor grafico della piantina"
            className={`floor-plan-canvas tool-${tool.toLowerCase()}`}
            onPointerMove={moveInteraction}
            onPointerUp={finishInteraction}
            ref={svgRef}
            role="application"
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
                  d={`M ${planDocument.gridSize} 0 L 0 0 0 ${planDocument.gridSize}`}
                  fill="none"
                  vectorEffect="non-scaling-stroke"
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
              className="floor-plan-grid"
              height={planDocument.height}
              pointerEvents="none"
              width={planDocument.width}
              x={0}
              y={0}
            />
            {planDocument.elements.map((element) => {
              const centerX = element.x + element.width / 2;
              const centerY = element.y + element.height / 2;
              const table = element.diningTableId
                ? tableById.get(element.diningTableId)
                : null;
              return (
                <g
                  className={`floor-plan-element element-${element.type.toLowerCase()} ${selectedId === element.id ? 'selected' : ''}`}
                  key={element.id}
                  onPointerDown={(event) =>
                    startInteraction(event, element, 'MOVE')
                  }
                  transform={`rotate(${element.rotation} ${centerX} ${centerY})`}
                >
                  {element.type === 'ELLIPSE' ||
                  (element.type === 'TABLE' &&
                    element.tableShape === 'ROUND') ? (
                    <ellipse
                      cx={centerX}
                      cy={centerY}
                      rx={element.width / 2}
                      ry={element.height / 2}
                    />
                  ) : (
                    <rect
                      height={element.height}
                      rx={element.type === 'TABLE' ? 16 : 4}
                      width={element.width}
                      x={element.x}
                      y={element.y}
                    />
                  )}
                  {element.type === 'TEXT' ? (
                    <text
                      dominantBaseline="middle"
                      fontSize={element.fontSize ?? 24}
                      textAnchor="middle"
                      x={centerX}
                      y={centerY}
                    >
                      {element.text}
                    </text>
                  ) : null}
                  {element.type === 'TABLE' ? (
                    <text
                      dominantBaseline="middle"
                      textAnchor="middle"
                      x={centerX}
                      y={centerY}
                    >
                      {table?.code ?? 'Tavolo'} · {table?.capacity ?? 0}
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
                      <line
                        className="floor-plan-rotation-line"
                        pointerEvents="none"
                        x1={centerX}
                        x2={centerX}
                        y1={element.y}
                        y2={element.y - 38}
                      />
                      <circle
                        className="floor-plan-rotate-handle"
                        cx={centerX}
                        cy={element.y - 48}
                        onPointerDown={(event) =>
                          startInteraction(event, element, 'ROTATE')
                        }
                        r={10}
                      />
                      <rect
                        className="floor-plan-resize-handle"
                        height={18}
                        onPointerDown={(event) =>
                          startInteraction(event, element, 'RESIZE')
                        }
                        width={18}
                        x={element.x + element.width - 9}
                        y={element.y + element.height - 9}
                      />
                    </>
                  ) : null}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="floor-plan-versions">
          <strong>Versioni</strong>
          <div className="data-list">
            {view.versions.map((version) => (
              <div className="floor-plan-version-row" key={version.id}>
                <div>
                  <strong>Versione {version.versionNumber}</strong>
                  <small>Revisione {version.revision}</small>
                </div>
                <StatusBadge status={version.status} />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
