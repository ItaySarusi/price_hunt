import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavTab {
  readonly path: string;
  readonly label: string;
  readonly icon: string;
}

/** App shell — glass top bar with brand + pill tabs, fixed futuristic background (SPEC §11.2). */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly tabs: readonly NavTab[] = [
    { path: '/search', label: 'Search', icon: 'search' },
    { path: '/history', label: 'History', icon: 'history' },
  ];
}
