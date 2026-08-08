/**
 * In-editor decoration while an optimization is in progress (option A core):
 * - A block banner widget above the selection (spinner + text + stop button)
 * - A mark highlight on the streaming rewrite range, auto-following/growing as the document changes
 *
 * Why a StateField instead of a ViewPlugin:
 * Per the CM6 docs, decorations that depend on state outside the editor (here, an optimization
 * session's range and label), or that include block widgets that change the vertical layout,
 * must live in a state field driven by transactions. ViewPlugin suits decorations computed on the
 * fly from viewport/interaction (like bracket-match highlighting), not this scenario.
 */
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { EditorState, StateEffectType } from "@codemirror/state";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { DecorationSet } from "@codemirror/view";
import type { Editor, EditorPosition } from "obsidian";

/** One optimization session: a CM6 offset range (not row/column) + a display label (template name or "Lite optimization"). */
export interface OptimizeSession {
  from: number;
  to: number;
  label: string;
}

/** Attach a session: dispatched when optimization starts. */
export const setOptimizeSession: StateEffectType<OptimizeSession> =
  StateEffect.define<OptimizeSession>();

/** Detach a session: dispatched when optimization ends / is interrupted / fails. */
export const clearOptimizeSession: StateEffectType<null> =
  StateEffect.define<null>();

export interface ProgressDecorationConfig {
  /** Callback for the banner "Stop" button click (typically used to cancel the current streaming request). */
  onStop?: () => void;
}

/** Field value: the current session range + the decoration set derived from it. */
interface OptimizeProgressState {
  range: OptimizeSession | null;
  deco: DecorationSet;
}

/** Block banner above the selection. A block widget changes the document's vertical layout — one reason decorations must live in a state field. */
class ProgressBannerWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly onStop?: () => void,
  ) {
    super();
  }

  /** Same label counts as the same widget, to avoid rebuilding the DOM repeatedly during streaming. */
  eq(other: ProgressBannerWidget): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const banner = createEl("div", { cls: "opo-progress-banner" });

    const spinner = createEl("span", { cls: "opo-spinner" });
    banner.appendChild(spinner);

    const text = createEl("span", { cls: "opo-progress-banner-text", text: `Optimizing… (${this.label})` });
    banner.appendChild(text);

    const stop = createEl("button", { cls: "opo-progress-banner-stop", text: "Stop" });
    // Intercept mousedown: prevent the editor from stealing focus/selection, leaving the click entirely to the button
    stop.addEventListener("mousedown", (event) => event.preventDefault());
    stop.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.onStop?.();
    });
    banner.appendChild(stop);

    return banner;
  }

  /** Tell CM the estimated height, to reduce vertical jitter on the first render of the block widget. */
  get estimatedHeight(): number {
    return 28;
  }
}

/**
 * Rebuild decorations for the range: a line-start block banner + a range mark.
 * RangeSetBuilder requires positions in ascending order; the banner at the line start always precedes the mark.
 */
function buildDeco(
  state: EditorState,
  range: OptimizeSession,
  config?: ProgressDecorationConfig,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  // Banner pinned to the start of the line the selection is on: cleanest block layout; side: -1 keeps it always before text inserted at the same position
  const lineStart = state.doc.lineAt(range.from).from;
  builder.add(
    lineStart,
    lineStart,
    Decoration.widget({
      widget: new ProgressBannerWidget(range.label, config?.onStop),
      block: true,
      side: -1,
    }),
  );
  if (range.from < range.to) {
    builder.add(range.from, range.to, Decoration.mark({ class: "opo-optimizing-range" }));
  }
  return builder.finish();
}

/**
 * Create the decoration StateField (one per editor view).
 * Decorations are exposed to EditorView.decorations via provide.
 */
export function createOptimizeProgressField(
  config?: ProgressDecorationConfig,
): StateField<OptimizeProgressState> {
  return StateField.define<OptimizeProgressState>({
    create: () => ({ range: null, deco: Decoration.none }),

    update(value, tr) {
      let range = value.range;

      // a. Map the range when the document changes. The assoc choice of mapPos is key to this module's correctness:
      //    from uses assoc -1 to pin before the change point — when replaceRange replaces the original selection, from stays at the start;
      //    to uses assoc 1 to advance with the change — on replace it reaches the end of the new text, and when streaming later
      //    appends at the end of the range, the highlight's tail follows and grows.
      if (range && tr.docChanged) {
        range = {
          ...range,
          from: tr.changes.mapPos(range.from, -1),
          to: tr.changes.mapPos(range.to, 1),
        };
      }

      // b. Session effects take priority over mapped results: a new round directly replaces the range; clear sets it to null
      for (const e of tr.effects) {
        if (e.is(setOptimizeSession)) range = e.value;
        else if (e.is(clearOptimizeSession)) range = null;
      }

      // c. Range invalid (cleared / deleted to empty) -> no decoration
      if (!range || range.to <= range.from) {
        return { range: null, deco: Decoration.none };
      }

      // d. Rebuild decorations only on document changes or effects; pure selection/viewport transactions reuse the existing ones
      if (tr.docChanged || tr.effects.length > 0) {
        return { range, deco: buildDeco(tr.state, range, config) };
      }
      return value;
    },

    provide: (field) => EditorView.decorations.from(field, (v) => v.deco),
  });
}

/**
 * Obsidian's Editor abstraction does not expose the CM6 EditorView. The common community practice is to read the
 * underlying view from editor.cm — this property has existed on Obsidian's private runtime for a long time, but it is
 * an unofficial API after all, so when it cannot be retrieved we degrade silently: the decoration is just an enhancement
 * layer, and its absence does not affect the main optimization flow.
 */
function getCmView(editor: Editor): EditorView | null {
  const view = (editor as unknown as { cm?: EditorView }).cm;
  return view ?? null;
}

/** Start an optimization session: convert the selection (Obsidian row/column) to CM offsets, then attach the decoration. */
export function beginOptimizeSession(
  editor: Editor,
  from: EditorPosition,
  to: EditorPosition,
  label: string,
): void {
  const view = getCmView(editor);
  if (!view) return;
  view.dispatch({
    effects: setOptimizeSession.of({
      from: editor.posToOffset(from),
      to: editor.posToOffset(to),
      label,
    }),
  });
}

/** End the session: remove all decorations. No-op when cm is unavailable. */
export function endOptimizeSession(editor: Editor): void {
  const view = getCmView(editor);
  if (!view) return;
  view.dispatch({ effects: clearOptimizeSession.of(null) });
}
