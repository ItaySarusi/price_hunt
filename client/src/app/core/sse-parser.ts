/**
 * Hand-written, framework-free Server-Sent Events parser (SPEC §11.3).
 * Feed it decoded text chunks with `push()`; it returns the complete frames found so far. Call `flush()` when the
 * stream ends to get a final frame that lacks its terminating blank line.
 */
export interface SseFrame {
  event: string;
  data: string;
}

export class SseParser {
  private buffer = '';

  /** Appends a chunk and returns every frame that is now complete (terminated by a blank line). */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    // A trailing CR may be the first half of a CRLF split across chunks: hold it back until the next chunk.
    const held = this.buffer.endsWith('\r') ? '\r' : '';
    const text = (held ? this.buffer.slice(0, -1) : this.buffer).replace(/\r\n|\r/g, '\n');

    const frames: SseFrame[] = [];
    let start = 0;
    let end: number;
    while ((end = text.indexOf('\n\n', start)) !== -1) {
      const frame = parseBlock(text.slice(start, end));
      if (frame) frames.push(frame);
      start = end + 2;
    }
    this.buffer = text.slice(start) + held;
    return frames;
  }

  /** Emits the remaining buffered frame (if any) and resets the parser. */
  flush(): SseFrame[] {
    const rest = this.buffer.replace(/\r\n|\r/g, '\n');
    this.buffer = '';
    const frame = parseBlock(rest);
    return frame ? [frame] : [];
  }
}

function parseBlock(block: string): SseFrame | null {
  let event = 'message';
  const data: string[] = [];
  let hasData = false;
  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') {
      data.push(value);
      hasData = true;
    }
  }
  return hasData ? { event, data: data.join('\n') } : null;
}
