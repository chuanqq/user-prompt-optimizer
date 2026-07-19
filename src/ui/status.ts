/**
 * Optimization session state controller:
 * - statusBarItem shows "Optimizing… / Generating… / Optimized (stats)", with fade in/out
 * - ribbonIconEl gets the is-optimizing class to trigger the pulse animation
 * - A singleton AbortController, interrupted by a second ribbon click
 * - Persistent progress Notice (option B): created/updated/destroyed via an injected factory; all no-ops safely when not injected
 */

/** Persistent progress Notice handle: update changes the text, hide closes and destroys it. */
export interface ProgressNoticeHandle {
  update(text: string): void;
  hide(): void;
}

/**
 * Persistent progress Notice factory: text is the initial text, onStop is the "Stop" button callback.
 * Injected by the plugin entry (which has DOM/Obsidian Notice access); pure-logic tests can inject a fake factory.
 */
export type ProgressNoticeFactory = (text: string, onStop: () => void) => ProgressNoticeHandle;

export class StatusController {
  private statusEl: HTMLElement | null = null;
  private ribbonEl: HTMLElement | null = null;
  private controller: AbortController | null = null;
  // Timer handle. In Obsidian (an Electron renderer) setTimeout and window.setTimeout are the same
  // function; we use the bare global so unit tests in a Node environment (no `window`) work as well.
  private resetTimer: ReturnType<typeof setTimeout> | null = null;
  private userCancelled = false;
  private noticeFactory: ProgressNoticeFactory | null = null;
  /** Current persistent Notice instance (singleton; on start, destroy the old one before creating a new one to prevent stacking). */
  private notice: ProgressNoticeHandle | null = null;

  setStatusEl(el: HTMLElement): void {
    this.statusEl = el;
    el.addClass("opo-status");
  }

  setRibbonEl(el: HTMLElement): void {
    this.ribbonEl = el;
    el.addClass("opo-ribbon");
  }

  /** Start an optimization: returns the AbortSignal for this request. Aborts any previous unfinished request first. */
  start(label?: string): AbortSignal {
    this.controller?.abort();
    this.userCancelled = false;
    this.controller = new AbortController();
    this.ribbonEl?.addClass("is-optimizing");
    const text = label ? `Optimizing… (${label})` : "Optimizing…";
    this.setText(text);
    // Persistent Notice singleton: destroy the old instance before creating a new one via the factory, to avoid Notice stacking on consecutive optimizations
    this.hideNotice();
    if (this.noticeFactory) {
      // onStop shares the same cancel semantics as a second ribbon click: goes through cancelIfRunning so it is marked as a "user-initiated cancel"
      this.notice = this.noticeFactory(text, () => this.cancelIfRunning());
    }
    return this.controller.signal;
  }

  /** First delta arrived: switch to "Generating…". */
  onGenerating(): void {
    this.setText("Generating…");
    this.notice?.update("Generating…");
  }

  /** Done: show stats, then fade out. */
  finish(summary: string, fadeAfterMs = 2500): void {
    this.ribbonEl?.removeClass("is-optimizing");
    this.controller = null;
    this.hideNotice();
    this.setText(summary, fadeAfterMs);
  }

  /** Failure: clear state. Error info goes through a Notice. */
  fail(): void {
    this.ribbonEl?.removeClass("is-optimizing");
    this.controller = null;
    this.hideNotice();
    this.setText("", 0);
  }

  /** If there is an in-progress request, abort it; returns whether it interrupted one. */
  cancelIfRunning(): boolean {
    if (this.controller) {
      this.userCancelled = true;
      this.controller.abort();
      this.controller = null;
      this.ribbonEl?.removeClass("is-optimizing");
      this.hideNotice();
      this.setText("Cancelled", 1500);
      return true;
    }
    return false;
  }

  /** Whether the most recent request was cancelled by the user (to distinguish from a timeout: cancel is silent, timeout notifies). */
  isUserCancelled(): boolean {
    return this.userCancelled;
  }

  /** Inject the persistent Notice factory (called by the plugin entry in onload; when not injected, all Notice-related logic safely no-ops). */
  setNoticeFactory(factory: ProgressNoticeFactory): void {
    this.noticeFactory = factory;
  }

  /** Destroy the current persistent Notice and clear the reference (no-op when no factory is set or there is no instance). */
  private hideNotice(): void {
    this.notice?.hide();
    this.notice = null;
  }

  private setText(text: string, fadeAfterMs = 0): void {
    if (this.resetTimer !== null) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    if (this.statusEl) {
      this.statusEl.setText(text);
      this.statusEl.setCssProps({ opacity: text ? "1" : "0" });
    }
    if (fadeAfterMs > 0) {
      this.resetTimer = setTimeout(() => {
        if (this.statusEl) this.statusEl.setCssProps({ opacity: "0" });
        this.resetTimer = null;
      }, fadeAfterMs);
    }
  }
}
