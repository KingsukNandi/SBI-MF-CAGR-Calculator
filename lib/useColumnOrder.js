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
  resetOrder,
} from "./columnOrder.js";

/**
 * Drag-to-reorder column state for one table, persisted per user.
 *
 * `tableId` namespaces the stored order, so each table keeps its own layout
 * and every instance sharing an id stays in step.
 */
export const useColumnOrder = (tableId, defaultColumns) => {
  const subscribe = useMemo(() => subscribeToOrder(tableId), [tableId]);
  const getSnapshot = useCallback(() => getOrderSnapshot(tableId), [tableId]);

  const storedKeys = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerOrderSnapshot
  );

  const columns = useMemo(
    () => reconcileOrder(storedKeys, defaultColumns),
    [storedKeys, defaultColumns]
  );

  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  const dragRef = useRef(null);

  const move = useCallback(
    (from, to) => {
      const next = moveColumn(columns, from, to);
      if (next !== columns) setOrder(tableId, next);
    },
    [columns, tableId]
  );

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
    dragIndex,
    overIndex,
    isDragging: dragIndex !== null,
    customised: isCustomised(columns, defaultColumns),
    move,
    reset,
    nudge,
    handlers: { onDragStart, onDragOver, onDrop, onDragEnd },
  };
};
