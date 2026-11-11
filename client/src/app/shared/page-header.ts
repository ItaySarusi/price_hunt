import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Page title (Space Grotesk) + one-line muted subtitle — SPEC §11.2. */
@Component({
  selector: 'ph-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="ph-page-title">{{ title() }}</h1>
    @if (subtitle()) {
      <p class="ph-page-subtitle">{{ subtitle() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
      margin: 8px 0 24px;
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string>('');
}
