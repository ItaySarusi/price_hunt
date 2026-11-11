import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App shell', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('renders the PriceHunt brand', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const brand = el.querySelector('.brand');
    expect(brand?.textContent?.replace(/\s+/g, ' ')).toContain('PriceHunt');
    expect(el.querySelector('.brand__accent')?.textContent).toBe('Hunt');
  });

  it('renders Search and History tabs as router links inside the main nav', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('nav[aria-label="Main"] a.tab'));
    expect(links.map(a => a.querySelector('.tab__label')?.textContent?.trim())).toEqual(['Search', 'History']);
    expect(links.map(a => a.getAttribute('href'))).toEqual(['/search', '/history']);
  });

  it('hosts a router outlet in the main content container', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('main router-outlet')).not.toBeNull();
  });
});
