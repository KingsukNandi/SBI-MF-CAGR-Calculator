"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE, tap } from "@/lib/motion";

/**
 * Offers a way back to the default layout, and only appears once something has
 * actually moved. A reordering feature with no undo leaves people stuck with a
 * layout they created by accident.
 */
const ResetColumnsButton = ({ orders }) => {
  const reduceMotion = useReducedMotion();
  const changed = orders.filter((o) => o.order.customised);

  return (
    <AnimatePresence>
      {changed.length > 0 && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={reduceMotion ? undefined : { opacity: 0, height: 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.fast, ease: EASE }}
          className="flex flex-wrap items-center gap-2 overflow-hidden"
        >
          <span className="text-[11px] text-gray-500">
            Column order changed. It is saved in this browser.
          </span>
          {changed.map(({ label, order }) => (
            <motion.button
              key={label}
              type="button"
              onClick={order.reset}
              whileTap={reduceMotion ? undefined : tap}
              className="text-[11px] px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 hover:border-[#00b5ef] hover:text-[#0095c7] transition-colors"
            >
              Reset {label} columns
            </motion.button>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ResetColumnsButton;
