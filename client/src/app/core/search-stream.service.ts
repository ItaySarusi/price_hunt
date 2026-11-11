import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { ProblemDetails, SearchEvent, SearchRequest } from './api.models';
import { SseFrame, SseParser } from './sse-parser';

/** Thrown (as an Observable error) when the API answers a stream request with a non-2xx status. */
export class ApiProblemError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly messages: string[],
  ) {
    super(title);
    this.name = 'ApiProblemError';
  }
}

const EVENT_TYPES = new Set<SearchEvent['type']>(['started', 'quote', 'supplier-failed', 'end']);

/** Streams search events over `fetch` (POST + SSE). Unsubscribing aborts the request and emits nothing further. */
@Injectable({ providedIn: 'root' })
export class SearchStreamService {
  stream(request: SearchRequest): Observable<SearchEvent> {
    return new Observable<SearchEvent>((subscriber) => {
      const controller = new AbortController();

      (async () => {
        const response = await fetch(`${environment.apiBaseUrl}/search/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });
        if (!response.ok) throw await toProblemError(response);
        if (!response.body) throw new Error('The server returned an empty response.');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        const parser = new SseParser();
        const emit = (frames: SseFrame[]) => {
          for (const f of frames) {
            if (!EVENT_TYPES.has(f.event as SearchEvent['type'])) continue;
            subscriber.next({ type: f.event, data: JSON.parse(f.data) } as SearchEvent);
          }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          emit(parser.push(decoder.decode(value, { stream: true })));
        }
        emit(parser.push(decoder.decode()));
        emit(parser.flush());
        subscriber.complete();
      })().catch((err: unknown) => {
        if (controller.signal.aborted) return; // unsubscribed: not an error
        subscriber.error(err);
      });

      return () => controller.abort();
    });
  }
}

async function toProblemError(response: Response): Promise<ApiProblemError> {
  let problem: ProblemDetails | null = null;
  try {
    problem = (await response.json()) as ProblemDetails;
  } catch {
    /* not JSON */
  }
  const title = problem?.title || `Request failed (${response.status})`;
  const messages = Object.values(problem?.errors ?? {}).flat();
  if (messages.length === 0) messages.push(problem?.detail || title);
  return new ApiProblemError(response.status, title, messages);
}
