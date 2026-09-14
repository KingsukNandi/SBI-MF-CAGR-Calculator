"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  reconcileOrder,
  moveColumn,
  isCustomised,
  subscribeToOrder,
  getOrderSnapshot,
  getServerOrderSnapshot,
  setOrder,
  setWidth,
  setHidden,
  resetOrder,
  MIN_COLUMN_WIDTH,
} from "./columnOrder.js";

/**
 * Drag-to-reorder column state for one table, persisted per user.
 *
 * `tableId` namespaces the stored order, so each table keeps its own layout
 * and every instance sharing an id stays in step.
 */
const EMPTY_WIDTHS = Object.freeze({});

export const useColumnOrder = (tableId, defaultColumns) => {
  const subscribe = useMemo(() => subscribeToOrder(tableId), [tableId]);
  const getSnapshot = useCallback(() => getOrderSnapshot(tableId), [tableId]);

  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerOrderSnapshot
  );

  // `stored` is null during SSR, so every derived value falls back to defaults.
  const allColumns = useMemo(
    () => reconcileOrder(stored?.keys, defaultColumns),
    [stored, defaultColumns]
  );

  const hidden = useMemo(() => new Set(stored?.hidden ?? []), [stored]);
  const widths = stored?.widths ?? EMPTY_WIDTHS;

  // What the table actually renders. Hiding never reorders: unhide and the
  // column returns to where it was.
  const columns = useMemo(
    () => allColumns.filter((c) => !hidden.has(c.key)),
    [allColumns, hidden]
  );

  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragRef = useRef(null);

  // Indices arrive from the rendered (visible) list, so they are mapped back
  // onto the full list before moving. Otherwise dragging with a column hidden
  // would move the wrong one.
  const move = useCallback(
    (from, to) => {
      const fromKey = columns[from]?.key;
      const toKey = columns[to]?.key;
      if (!fromKey || !toKey) return;
      const fromAll = allColumns.findIndex((c) => c.key === fromKey);
      const toAll = allColumns.findIndex((c) => c.key === toKey);
      const next = moveColumn(allColumns, fromAll, toAll);
      if (next !== allColumns) setOrder(tableId, next);
    },
    [columns, allColumns, tableId]
  );

  const resize = useCallback(
    (key, px) => setWidth(tableId, key, px),
    [tableId]
  );

  const toggleVisible = useCallback(
    (key) => {
      const next = new Set(hidden);
      if (next.has(key)) next.delete(key);
      // Refuse to hide the last column: an empty table is not a useful state.
      else if (columns.length > 1) next.add(key);
      setHidden(tableId, next);
    },
    [hidden, columns.length, tableId]
  );

  const showAll = useCallback(() => setHidden(tableId, []), [tableId]);

  const reset = useCallback(() => resetOrder(tableId), [tableId]);

  const onDragStart = useCallback((index) => {
    dragRef.current = index;
    setDragIndex(index);
  }, []);

  const onDragOver = useCallback(
    (index) => setOverIndex((cur) => (cur === index ? cur : index)),
    []
  );

  const onDrop = useCallback(
    (index) => {
      const from = dragRef.current;
      if (from !== null && from !== index) move(from, index);
      dragRef.current = null;
      setDragIndex(null);
      setOverIndex(null);
    },
    [move]
  );

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }, []);

  /** Keyboard equivalent, because drag and drop alone is not accessible. */
  const nudge = useCallback(
    (index, direction) => {
      const to = index + direction;
      if (to < 0 || to >= columns.length) return null;
      move(index, to);
      return to;
    },
    [columns.length, move]
  );

  return {
    columns,
    allColumns,
    hidden,
    widths,
    minWidth: MIN_COLUMN_WIDTH,
    dragIndex,
    overIndex,
    isDragging: dragIndex !== null,
    customised:
      isCustomised(allColumns, defaultColumns) ||
      hidden.size > 0 ||
      Object.keys(widths).length > 0,
    move,
    resize,
    toggleVisible,
    showAll,
    reset,
    nudge,
    handlers: { onDragStart, onDragOver, onDrop, onDragEnd },
  };
};
