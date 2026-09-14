"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { DURATION, EASE, tap } from "@/lib/motion";

/**
 * Show and hide columns.
 *
 * Order is preserved while hidden, so unhiding returns a column to where it
 * was rather than appending it. The last visible column cannot be hidden:
 * an empty table is not a state worth being able to reach.
 */
const ColumnPicker = ({ label = "Columns", order }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const reduceMotion = useReducedMotion();

  const hiddenCount = order.hidden.size;
  const total = order.allColumns.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="true"
        whileTap={reduceMotion ? undefined : tap}
        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-gray-300 text-gray-700 hover:border-[#00b5ef] hover:text-[#0095c7] transition-colors"
      >
        <span aria-hidden="true">☰</span>
        {label}
        <span className="text-gray-500 tabular-nums">
          {total - hiddenCount}/{total}
        </span>
        <motion.span
          aria-hidden="true"
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
          className="inline-block text-[10px]"
        >
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="group"
            aria-label={`${label} to show`}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
            style={{ originY: 0 }}
            className="absolute left-0 top-full mt-1 z-30 w-56 max-h-80 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
          >
            {order.allColumns.map((column) => {
              const visible = !order.hidden.has(column.key);
              const isLast = visible && order.columns.length === 1;
              return (
                <label
                  key={column.key}
                  className={`flex items-center gap-2 px-3 py-1.5 text-sm transition-colors ${
                    isLast
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer hover:bg-gray-50"
                  }`}
                  title={isLast ? "At least one column must stay visible" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={visible}
                    disabled={isLast}
                    onChange={() => order.toggleVisible(column.key)}
                  />
                  <span className="flex-1">{column.label}</span>
                </label>
              );
            })}

            {hiddenCount > 0 && (
              <button
                type="button"
                onClick={order.showAll}
                className="w-full text-left px-3 py-1.5 mt-1 border-t border-gray-100 text-xs text-[#00b5ef] hover:bg-gray-50 transition-colors"
              >
                Show all {total}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ColumnPicker;
