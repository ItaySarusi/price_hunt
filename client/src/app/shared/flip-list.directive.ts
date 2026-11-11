import { Directive, DoCheck, ElementRef, afterEveryRender, inject, input } from '@angular/core';

/** SPEC §11.3: re-order slide 220 ms, entry fade/scale 160 ms. */
export const FLIP_MOVE_MS = 220;
export const FLIP_ENTER_MS = 160;
export const FLIP_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * FLIP list animation (SPEC §11.3, R12). Put it on the list container and bind the rendered array:
 * `<ol [phFlipList]="quotes()">`; every child carries a stable key attribute (default `data-supplier`).
 *
 * - First:  `ngDoCheck` runs while the host view is being checked, BEFORE the `@for` below it updates the DOM. When the
 *           bound array changed, it records each child's on-screen top (getBoundingClientRect — includes any running
 *           FLIP offset, so an interrupted slide continues from where it visually is).
 * - Last/Invert/Play: after the render (same task, before paint) each moved child is animated with the Web Animations
 *   API from `translate: 0 (old − new)` to `0 0`; children that weren't there before fade/scale in.
 *
 * Only `translate`/`scale`/`opacity` are animated (compositor-only, no layout). `prefers-reduced-motion: reduce`
 * disables everything (instant updates). Nodes are never re-created here — that's `track` in the `@for`.
 */
@Directive({ selector: '[phFlipList]' })
export class FlipListDirective implements DoCheck {
  /** The rendered items; a new array reference means "the list is about to change". */
  readonly phFlipList = input.required<readonly unknown[]>();
  /** Attribute on each child that identifies it across renders. */
  readonly phFlipKey = input('data-supplier');

  private readonly host: HTMLElement = inject(ElementRef<HTMLElement>).nativeElement;
  private readonly running = new Map<Element, Animation>();
  private lastItems: readonly unknown[] | undefined;
  /** Visual tops recorded before the pending DOM update; null when there is nothing to play. */
  private before: Map<string, number> | null = null;

  constructor() {
    afterEveryRender({ mixedReadWrite: () => this.play() });
  }

  ngDoCheck(): void {
    const items = this.phFlipList();
    if (items === this.lastItems) return;
    const first = this.lastItems === undefined;
    this.lastItems = items;
    // Initial render (e.g. coming back from History with results): show the list as-is, no entrance animation.
    this.before = first ? null : this.measure();
  }

  private measure(): Map<string, number> {
    const tops = new Map<string, number>();
    for (const [key, el] of this.children()) tops.set(key, el.getBoundingClientRect().top);
    return tops;
  }

  private *children(): Iterable<[string, HTMLElement]> {
    const attr = this.phFlipKey();
    for (const el of Array.from(this.host.children) as HTMLElement[]) {
      const key = el.getAttribute(attr);
      if (key !== null) yield [key, el];
    }
  }

  private play(): void {
    const before = this.before;
    if (!before) return;
    this.before = null;
    if (prefersReducedMotion()) return;

    for (const [key, el] of this.children()) {
      if (typeof el.animate !== 'function') return;
      const old = before.get(key);
      if (old === undefined) {
        this.start(
          el,
          [
            { opacity: 0, scale: '0.96' },
            { opacity: 1, scale: '1' },
          ],
          { duration: FLIP_ENTER_MS, easing: 'ease-out' },
          'enter',
        );
        continue;
      }
      // Drop the running slide first so we measure the true layout position, then invert from the visual one.
      this.running.get(el)?.cancel();
      this.running.delete(el);
      const dy = old - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 0.5) continue;
      this.start(
        el,
        [{ translate: `0px ${dy}px` }, { translate: '0px 0px' }],
        { duration: FLIP_MOVE_MS, easing: FLIP_EASING },
        'slide',
      );
    }
  }

  private start(
    el: HTMLElement,
    keyframes: Keyframe[],
    options: KeyframeAnimationOptions,
    kind: 'enter' | 'slide',
  ): void {
    const anim = el.animate(keyframes, options);
    // Only slides are tracked (and interruptible); a later slide never cancels an entry fade-in mid-way.
    if (kind === 'slide') {
      this.running.set(el, anim);
      anim.finished?.then(
        () => this.running.get(el) === anim && this.running.delete(el),
        () => undefined,
      );
    }
  }
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
