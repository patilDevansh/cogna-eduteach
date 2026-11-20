import { prettyAlgebra } from "@/components/games/pretty-algebra";

/** Plain algebra ("3(x + 4) = 21", "12x^2 + 18x") set like a textbook: italic letters, upright numbers. */
export function Maths({ children, className }: { children: string; className?: string }) {
  // Splitting on a captured letter leaves the letters at the odd indexes.
  const parts = prettyAlgebra(children).split(/([A-Za-z])/);
  return (
    <span className={className ? `maths ${className}` : "maths"}>
      {parts.map((part, i) => (i % 2 ? <i key={i}>{part}</i> : part))}
    </span>
  );
}
