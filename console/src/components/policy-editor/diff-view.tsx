import { useEffect, useRef } from "react";
import { MergeView } from "@codemirror/merge";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";

/*
 * Side-by-side policy version diff. Both panes are read-only — versions
 * are immutable history.
 */
export function DiffView({ before, after }: { before: string; after: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const extensions = [basicSetup, yaml(), EditorState.readOnly.of(true)];
    const view = new MergeView({
      a: { doc: before, extensions },
      b: { doc: after, extensions },
      parent: containerRef.current!,
      gutter: true,
    });
    return () => view.destroy();
  }, [before, after]);

  return (
    <div
      ref={containerRef}
      className="max-h-[60vh] overflow-auto rounded-md border [&_.cm-editor]:bg-card"
    />
  );
}

export default DiffView;
