"use client";

import { useRef, useCallback } from "react";
import { ariaSortFor, sortIndicator } from "@/lib/sorting";

/**
 * A table header that both sorts and reorders.
 *
 * Sorting and dragging are kept on separate targets: the label sorts, the grip
 * drags. Making the whole cell draggable turns every sort click into a
 * half-started drag, which feels broken.
 *
 * Keyboard users get Alt+Left / Alt+Right on the grip. Drag and drop has no
 * keyboard equivalent of its own, so without this the feature simply would not
 * exist for them.
 */
const ColumnHeader = ({
  column,
  index,
  sortConfig,
  onSort,
  dragIndex,
  overIndex,
  handlers,
  onNudge,
  onResize,
  width,
  dark = true,
  total,
}) => {
  const gripRef = useRef(null);
  const thRef = useRef(null);

  const isDragged = dragIndex === index;
  const isTarget = overIndex === index && dragIndex !== null && dragIndex !== index;
  // The insertion line sits on the side the column will arrive from, so it
  // marks where the column lands rather than which cell is hovered.
  const lineSide = isTarget && dragIndex < index ? "right" : "left";

  const handleKeyDown = (event) => {
    if (!event.altKey) return;
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    const landed = onNudge(index, direction);
    // Keep focus on the grip that moved, so it can be nudged repeatedly.
    if (landed !== null) {
      requestAnimationFrame(() => {
        const cells = gripRef.current
          ?.closest("tr")
          ?.querySelectorAll("[data-col-grip]");
        cells?.[landed]?.focus();
      });
    }
  };

  // Pointer events rather than mouse events, so a stylus or touch drag works.
  // Listeners go on the window: the pointer routinely leaves the 4px handle
  // mid-drag, and a handler bound to the handle would stop receiving moves.
  const startResize = useCallback(
    (event) => {
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX;
      const startWidth = thRef.current?.getBoundingClientRect().width ?? 0;

      const onMove = (e) => onResize(column.key, startWidth + (e.clientX - startX));
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      // Hold the resize cursor and kill text selection for the whole drag.
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [column.key, onResize]
  );

  const resizeByKey = (event) => {
    const step = event.shiftKey ? 40 : 10;
    const delta =
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (!delta) return;
    event.preventDefault();
    const current = thRef.current?.getBoundingClientRect().width ?? 0;
    onResize(column.key, current + delta);
  };

  return (
    <th
      ref={thRef}
      scope="col"
      style={width ? { width, minWidth: width, maxWidth: width } : undefined}
      aria-sort={ariaSortFor(sortConfig, column.key)}
      onDragOver={(e) => {
        // Without preventDefault the browser refuses the drop outright.
        e.preventDefault();
        handlers.onDragOver(index);
      }}
      onDrop={(e) => {
        e.preventDefault();
        handlers.onDrop(index);
      }}
      className={`relative p-0 ${column.align} ${
        isDragged ? "opacity-40" : ""
      } transition-opacity duration-150`}
    >
      {isTarget && (
        <span
          aria-hidden="true"
          className={`absolute top-0 bottom-0 w-0.5 z-20 ${
            dark ? "bg-white" : "bg-[#00b5ef]"
          } ${lineSide === "left" ? "left-0" : "right-0"}`}
        />
      )}

      <div
        className={`flex items-center gap-0.5 ${
          column.align === "text-right" ? "justify-end" : "justify-start"
        }`}
      >
        <span
          ref={gripRef}
          data-col-grip
          role="button"
          tabIndex={0}
          draggable
          aria-label={`Reorder ${column.label}. Column ${index + 1} of ${total}. Drag, or hold Alt and press the left or right arrow key.`}
          title="Drag to reorder, or Alt plus arrow keys"
          onDragStart={(e) => {
            // Firefox will not start a drag unless some data is set.
            e.dataTransfer.setData("text/plain", column.key);
            e.dataTransfer.effectAllowed = "move";
            handlers.onDragStart(index);
          }}
          onDragEnd={handlers.onDragEnd}
          onKeyDown={handleKeyDown}
          className={`cursor-grab active:cursor-grabbing select-none px-1 py-2 leading-none rounded opacity-30 group-hover/head:opacity-70 hover:!opacity-100 focus-visible:opacity-100 focus-visible:outline-2 transition-opacity duration-150 ${
            dark ? "focus-visible:outline-white" : "focus-visible:outline-[#00b5ef]"
          }`}
        >
          ⠿
        </span>

        <button
          type="button"
          onClick={() => onSort(column.key)}
          className={`px-2 py-2 whitespace-nowrap cursor-pointer transition-colors duration-150 rounded ${
            dark
              ? "hover:bg-[#0095c7] focus-visible:outline-2 focus-visible:outline-white font-semibold"
              : "hover:bg-gray-200/70 focus-visible:outline-2 focus-visible:outline-[#00b5ef] font-normal text-[11px] uppercase tracking-wider text-gray-500"
          }`}
        >
          {column.label}
          <span className="inline-block w-3">
            {sortIndicator(sortConfig, column.key)}
          </span>
        </button>
      </div>

      <span
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${column.label}. Use the left and right arrow keys, or hold Shift for larger steps.`}
        tabIndex={0}
        onPointerDown={startResize}
        onKeyDown={resizeByKey}
        onDoubleClick={() => onResize(column.key, 0)}
        title="Drag to resize, double click to reset this column"
        className={`absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none touch-none opacity-0 group-hover/head:opacity-40 hover:!opacity-100 focus-visible:opacity-100 focus-visible:outline-2 transition-opacity ${
          dark
            ? "bg-white focus-visible:outline-white"
            : "bg-[#00b5ef] focus-visible:outline-[#00b5ef]"
        }`}
      />
    </th>
  );
};

export default ColumnHeader;
