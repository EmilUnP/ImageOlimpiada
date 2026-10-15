import { Fragment, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { splitMath } from "@/lib/formula";

const renderMath = (tex: string) =>
  katex.renderToString(tex, {
    throwOnError: false,
    strict: "ignore",
    trust: false,
    output: "html",
  });

interface MathTextProps {
  text: string;
  className?: string;
}

/** Renders text with $...$ LaTeX segments as typeset formulas */
export const MathText = ({ text, className }: MathTextProps) => {
  const segments = useMemo(
    () => splitMath(text).map((segment) => (segment.math ? { ...segment, html: renderMath(segment.value) } : segment)),
    [text]
  );

  return (
    <span className={className}>
      {segments.map((segment, index) =>
        "html" in segment ? (
          <span key={index} title={`$${segment.value}$`} dangerouslySetInnerHTML={{ __html: segment.html }} />
        ) : (
          <Fragment key={index}>{segment.value}</Fragment>
        )
      )}
    </span>
  );
};
