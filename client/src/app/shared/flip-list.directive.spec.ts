import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FlipListDirective } from './flip-list.directive';

const SLOT = 80;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FlipListDirective],
  template: `
    <ul [phFlipList]="items()">
      @for (k of items(); track k) {
        <li [attr.data-supplier]="k">{{ k }}</li>
      }
    </ul>
  `,
})
class Host {
  readonly items = signal<readonly string[]>([]);
}

/** jsdom has no layout: each <li> reports top = (index in parent) × SLOT, so DOM order drives positions. */
function fakeLayout(): void {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const i = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
    return { top: i * SLOT, bottom: i * SLOT + 72, left: 0, right: 100, width: 100, height: 72, x: 0, y: i * SLOT } as DOMRect;
  });
}

function mockReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (q: string) => ({
    matches: reduce && q.includes('prefers-reduced-motion'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

describe('FlipListDirective', () => {
  let fixture: ComponentFixture<Host>;
  let animate: ReturnType<typeof vi.fn>;
  const li = (k: string) => fixture.nativeElement.querySelector(`li[data-supplier="${k}"]`) as HTMLElement;

  const set = async (items: string[]) => {
    fixture.componentInstance.items.set(items);
    fixture.detectChanges();
    await fixture.whenStable();
  };

  /** Calls to animate() made on a given element. */
  const callsOn = (el: HTMLElement) => animate.mock.contexts.map((c, i) => [c, animate.mock.calls[i]] as const).filter(([c]) => c === el).map(([, a]) => a);

  beforeEach(() => {
    fakeLayout();
    mockReducedMotion(false);
    animate = vi.fn(() => ({ cancel: vi.fn(), finished: Promise.resolve() }));
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = animate;
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (HTMLElement.prototype as unknown as { animate?: unknown }).animate;
  });

  it('slides an existing item from its old position when an item is inserted above it (translate old−new → 0)', async () => {
    await set(['B']);
    animate.mockClear();

    await set(['A', 'B']); // B moves from slot 0 to slot 1

    const calls = callsOn(li('B'));
    expect(calls.length).toBe(1);
    const [keyframes, opts] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]['translate']).toBe(`0px ${-SLOT}px`);
    expect(keyframes[1]['translate']).toBe('0px 0px');
    expect(opts.duration).toBe(220);
    expect(opts.easing).toBe('cubic-bezier(0.2, 0.8, 0.2, 1)');
  });

  it('fades/scales a newly added item in (0.96 → 1, 160 ms) and does not slide items that did not move', async () => {
    await set(['A']);
    animate.mockClear();

    await set(['A', 'C']);

    expect(callsOn(li('A')).length).toBe(0);
    const calls = callsOn(li('C'));
    expect(calls.length).toBe(1);
    const [keyframes, opts] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]).toMatchObject({ opacity: 0, scale: '0.96' });
    expect(keyframes[1]).toMatchObject({ opacity: 1, scale: '1' });
    expect(opts.duration).toBe(160);
  });

  it('interrupts a running slide: cancels it and starts the new slide from the current on-screen offset', async () => {
    // Visual offset per element while a slide is "running"; layout top stays index × SLOT.
    const visual = new Map<Element, number>();
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
      const i = this.parentElement ? Array.from(this.parentElement.children).indexOf(this) : 0;
      const top = i * SLOT + (visual.get(this) ?? 0);
      return { top, bottom: top + 72, left: 0, right: 100, width: 100, height: 72, x: 0, y: top } as DOMRect;
    });
    const cancels: ReturnType<typeof vi.fn>[] = [];
    animate.mockImplementation(function (this: HTMLElement) {
      const el = this;
      const cancel = vi.fn(() => visual.delete(el));
      cancels.push(cancel);
      return { cancel, finished: new Promise(() => undefined) }; // never finishes on its own
    });

    await set(['B']);
    animate.mockClear();
    cancels.length = 0;
    await set(['A', 'B']); // A fades in, B starts sliding slot 0 → slot 1
    const bCall = animate.mock.contexts.indexOf(li('B'));
    expect(bCall).toBeGreaterThanOrEqual(0);
    const firstSlide = cancels[bCall];

    visual.set(li('B'), -40); // mid-slide: B is drawn at top 40 while its layout slot is 80
    animate.mockClear();
    await set(['A', 'C', 'B']); // B's layout moves to slot 2 (160)

    expect(firstSlide).toHaveBeenCalledTimes(1);
    const calls = callsOn(li('B'));
    expect(calls.length).toBe(1);
    const [keyframes] = calls[0] as [Keyframe[], KeyframeAnimationOptions];
    expect(keyframes[0]['translate']).toBe(`0px ${40 - 2 * SLOT}px`); // from the visual top (40), not the old slot (80)
    expect(keyframes[1]['translate']).toBe('0px 0px');
  });

  it('reuses the same DOM element for an item across re-orders', async () => {
    await set(['B', 'C']);
    const b = li('B');
    await set(['A', 'B', 'C']);
    expect(li('B')).toBe(b);
  });

  it('does nothing when prefers-reduced-motion is set', async () => {
    mockReducedMotion(true);
    await set(['B']);
    await set(['A', 'B']);
    expect(animate).not.toHaveBeenCalled();
  });

  it('does not animate unrelated change detection passes', async () => {
    await set(['A', 'B']);
    animate.mockClear();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(animate).not.toHaveBeenCalled();
  });
});
