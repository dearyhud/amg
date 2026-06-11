import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { yaml } from "@codemirror/lang-yaml";
import { lintGutter, setDiagnostics, type Diagnostic } from "@codemirror/lint";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { CompileError } from "@/api/schemas";

// Rosé Pine Moon for the YAML surface
const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "#9ccfd8" }, // foam: keys
  { tag: tags.string, color: "#f6c177" }, // gold: strings
  { tag: tags.number, color: "#ea9a97" }, // rose
  { tag: tags.bool, color: "#ea9a97" },
  { tag: tags.null, color: "#908caa" },
  { tag: tags.comment, color: "#6e6a86", fontStyle: "italic" },
  { tag: tags.punctuation, color: "#908caa" },
]);

const editorTheme = EditorView.theme(
  {
    "&": { backgroundColor: "transparent" },
    ".cm-content": { caretColor: "#e0def4", padding: "8px 0" },
    ".cm-cursor": { borderLeftColor: "#e0def4" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
      backgroundColor: "#44415a !important",
    },
  },
  { dark: true },
);

export interface PolicyEditorProps {
  /** initial document; remount (key) to replace it wholesale */
  defaultValue: string;
  onChange: (value: string) => void;
  errors?: CompileError[];
  readOnly?: boolean;
}

/*
 * CodeMirror wrapper. Compile errors from the server land in the lint
 * gutter with their line/column — the server-side compiler is the single
 * source of truth; this component never validates locally.
 */
export function PolicyEditor({ defaultValue, onChange, errors, readOnly }: PolicyEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const view = new EditorView({
      state: EditorState.create({
        doc: defaultValue,
        extensions: [
          basicSetup,
          yaml(),
          lintGutter(),
          syntaxHighlighting(highlight),
          editorTheme,
          EditorState.readOnly.of(!!readOnly),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
      parent: containerRef.current!,
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // mount-once by design; defaultValue changes arrive via key remounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const doc = view.state.doc;
    const diagnostics: Diagnostic[] = (errors ?? []).map((error) => {
      const lineNumber = Math.min(Math.max(error.line ?? 1, 1), doc.lines);
      const line = doc.line(lineNumber);
      const from = Math.min(line.from + Math.max((error.column ?? 1) - 1, 0), line.to);
      return { from, to: line.to, severity: "error", message: error.message };
    });
    view.dispatch(setDiagnostics(view.state, diagnostics));
  }, [errors]);

  return (
    <div
      ref={containerRef}
      data-testid="policy-editor"
      className="h-full min-h-80 overflow-auto rounded-md border bg-card"
    />
  );
}

export default PolicyEditor;
