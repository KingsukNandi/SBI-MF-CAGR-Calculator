"use client";

import { Fragment } from "react";
import { parseBlocks } from "@/lib/miniMarkdown";

/**
 * Renders the small subset of markdown that chat replies actually contain.
 * Builds React elements from parsed tokens — no HTML string is constructed, so
 * nothing the model emits can inject markup.
 */
const Spans = ({ spans }) =>
  spans.map((span, i) => {
    switch (span.type) {
      case "bold":
        return (
          <strong key={i} className="font-semibold">
            {span.value}
          </strong>
        );
      case "italic":
        return <em key={i}>{span.value}</em>;
      case "code":
        return (
          <code
            key={i}
            className="px-1 py-0.5 rounded bg-black/5 text-[0.9em] font-mono"
          >
            {span.value}
          </code>
        );
      default:
        return <Fragment key={i}>{span.value}</Fragment>;
    }
  });

const Markdown = ({ children }) => {
  const blocks = parseBlocks(children);

  return (
    <>
      {blocks.map((block, i) => {
        if (block.type === "list") {
          const List = block.ordered ? "ol" : "ul";
          return (
            <List
              key={i}
              className={`my-1.5 pl-4 space-y-0.5 ${
                block.ordered ? "list-decimal" : "list-disc"
              }`}
            >
              {block.items.map((item, j) => (
                <li key={j}>
                  <Spans spans={item} />
                </li>
              ))}
            </List>
          );
        }
        return (
          <p key={i} className="my-1.5 first:mt-0 last:mb-0">
            <Spans spans={block.spans} />
          </p>
        );
      })}
    </>
  );
};

export default Markdown;
