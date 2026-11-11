import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ApiProblemError, SearchStreamService } from './search-stream.service';
import { SearchEvent, SearchRequest } from './api.models';

const REQ: SearchRequest = { fromLocation: 'CNSHA', toLocation: 'USLAX', fromDate: '2026-11-20', toDate: '2026-11-30' };
const enc = new TextEncoder();

const frame = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const started = { searchId: 's1', total: 2, suppliers: ['A', 'B'], timeoutMs: 6000, startedAt: '2026-11-09T10:00:00Z' };
const quote = {
  searchId: 's1', supplier: 'A', supplierName: 'Supplier A', price: 100, currency: 'USD',
  responseTimeMs: 900, receivedAt: '2026-11-09T10:00:01Z',
};
const end = { searchId: 's1', status: 'Completed', total: 2, responded: 2, succeeded: 1, failed: 1, noResponse: 0, elapsedMs: 1500 };

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

function okResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

describe('SearchStreamService', () => {
  let service: SearchStreamService;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    service = TestBed.inject(SearchStreamService);
  });
  afterEach(() => vi.unstubAllGlobals());

  function collect(req = REQ) {
    const events: SearchEvent[] = [];
    const state: { error?: unknown; complete: boolean } = { complete: false };
    const sub = service.stream(req).subscribe({
      next: (e) => events.push(e),
      error: (e) => (state.error = e),
      complete: () => (state.complete = true),
    });
    return { events, state, sub };
  }

  it('POSTs JSON to the stream endpoint', async () => {
    fetchMock.mockResolvedValue(okResponse(streamOf([])));
    collect();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:5080/api/search/stream');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual(REQ);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('emits typed events in order, even when frames are split across chunks, then completes', async () => {
    const text = frame('started', started) + frame('quote', quote) + frame('supplier-failed', { ...quote, reason: 'boom' }) + frame('end', end);
    // split mid-frame and mid "\n\n"
    const cut = text.indexOf('"price"') ;
    const cut2 = text.indexOf('\n\nevent: supplier-failed') + 1;
    fetchMock.mockResolvedValue(okResponse(streamOf([text.slice(0, cut), text.slice(cut, cut2), text.slice(cut2)])));
    const { events, state } = collect();
    await vi.waitFor(() => expect(state.complete).toBe(true));
    expect(events.map((e) => e.type)).toEqual(['started', 'quote', 'supplier-failed', 'end']);
    expect(events[0].data).toEqual(started);
    expect(events[3].data).toEqual(end);
    expect(state.error).toBeUndefined();
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = enc.encode(frame('quote', { ...quote, supplierName: 'Zürich ✈' }));
    const mid = bytes.indexOf(0xc3) + 1; // between the two bytes of "ü"
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, mid));
        c.enqueue(bytes.slice(mid));
        c.close();
      },
    });
    fetchMock.mockResolvedValue(okResponse(body));
    const { events, state } = collect();
    await vi.waitFor(() => expect(state.complete).toBe(true));
    expect((events[0].data as { supplierName: string }).supplierName).toBe('Zürich ✈');
  });

  it('aborts the request on unsubscribe without emitting an error', async () => {
    let signal!: AbortSignal;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal!;
      return new Promise((_res, rej) => signal.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError'))));
    });
    const { sub, state, events } = collect();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    sub.unsubscribe();
    expect(signal.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(state.error).toBeUndefined();
    expect(events).toEqual([]);
  });

  it('aborts mid-stream on unsubscribe and stops emitting', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    let signal!: AbortSignal;
    const body = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) });
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      signal = init.signal!;
      signal.addEventListener('abort', () => { try { controller.error(new DOMException('aborted', 'AbortError')); } catch { /* closed */ } });
      return Promise.resolve(okResponse(body));
    });
    const { sub, state, events } = collect();
    controller.enqueue(enc.encode(frame('started', started)));
    await vi.waitFor(() => expect(events.length).toBe(1));
    sub.unsubscribe();
    expect(signal.aborted).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(state.error).toBeUndefined();
    expect(events.length).toBe(1);
  });

  it('maps a 400 problem-details body to ApiProblemError', async () => {
    const problem = { title: 'One or more validation errors occurred.', status: 400, errors: { fromLocation: ['Unknown location.'], toDate: ['Must be after fromDate.'] } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(problem), { status: 400, headers: { 'Content-Type': 'application/problem+json' } }));
    const { state } = collect();
    await vi.waitFor(() => expect(state.error).toBeDefined());
    const err = state.error as ApiProblemError;
    expect(err).toBeInstanceOf(ApiProblemError);
    expect(err.status).toBe(400);
    expect(err.title).toBe(problem.title);
    expect(err.messages).toEqual(['Unknown location.', 'Must be after fromDate.']);
  });

  it('falls back to a generic ApiProblemError for a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(new Response('Bad gateway', { status: 502 }));
    const { state } = collect();
    await vi.waitFor(() => expect(state.error).toBeDefined());
    const err = state.error as ApiProblemError;
    expect(err).toBeInstanceOf(ApiProblemError);
    expect(err.status).toBe(502);
    expect(err.messages.length).toBeGreaterThan(0);
  });

  it('errors on a network failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { state } = collect();
    await vi.waitFor(() => expect(state.error).toBeInstanceOf(Error));
    expect(state.error).not.toBeInstanceOf(ApiProblemError);
  });
});
