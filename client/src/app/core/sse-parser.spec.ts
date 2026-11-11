import { SseParser, SseFrame } from './sse-parser';

const frame = (event: string, data: string) => `event: ${event}\ndata: ${data}\n\n`;

function parseAll(chunks: string[]): SseFrame[] {
  const p = new SseParser();
  const out: SseFrame[] = [];
  for (const c of chunks) out.push(...p.push(c));
  out.push(...p.flush());
  return out;
}

describe('SseParser', () => {
  it('parses a single frame', () => {
    expect(parseAll([frame('quote', '{"a":1}')])).toEqual([{ event: 'quote', data: '{"a":1}' }]);
  });

  it('parses multiple frames in one chunk', () => {
    const text = frame('started', '{"x":1}') + frame('quote', '{"y":2}') + frame('end', '{}');
    expect(parseAll([text]).map((f) => f.event)).toEqual(['started', 'quote', 'end']);
  });

  it('handles a frame split at every possible position', () => {
    const text = frame('started', '{"x":1}') + frame('quote', '{"y":2}');
    const expected = [
      { event: 'started', data: '{"x":1}' },
      { event: 'quote', data: '{"y":2}' },
    ];
    for (let i = 0; i <= text.length; i++) {
      expect(parseAll([text.slice(0, i), text.slice(i)])).toEqual(expected);
    }
  });

  it('handles one character per chunk', () => {
    const text = frame('quote', '{"y":2}') + frame('end', '{}');
    expect(parseAll(text.split('')).map((f) => f.event)).toEqual(['quote', 'end']);
  });

  it('does not emit a frame before its blank line arrives', () => {
    const p = new SseParser();
    expect(p.push('event: quote\ndata: {}\n')).toEqual([]);
    expect(p.push('\n')).toEqual([{ event: 'quote', data: '{}' }]);
  });

  it('tolerates CRLF line endings, including a split CRLF', () => {
    const text = 'event: quote\r\ndata: {"a":1}\r\n\r\nevent: end\r\ndata: {}\r\n\r\n';
    expect(parseAll([text]).map((f) => f.event)).toEqual(['quote', 'end']);
    for (let i = 0; i <= text.length; i++) {
      expect(parseAll([text.slice(0, i), text.slice(i)])).toEqual([
        { event: 'quote', data: '{"a":1}' },
        { event: 'end', data: '{}' },
      ]);
    }
  });

  it('tolerates bare CR line endings', () => {
    expect(parseAll(['event: quote\rdata: {}\r\r'])).toEqual([{ event: 'quote', data: '{}' }]);
  });

  it('joins multi-line data with \\n', () => {
    expect(parseAll(['event: quote\ndata: line1\ndata: line2\n\n'])).toEqual([{ event: 'quote', data: 'line1\nline2' }]);
  });

  it('ignores comment lines', () => {
    expect(parseAll([': keep-alive\n\nevent: quote\n: note\ndata: {}\n\n'])).toEqual([{ event: 'quote', data: '{}' }]);
  });

  it('accepts the optional space after the colon (and its absence)', () => {
    expect(parseAll(['event:quote\ndata:{"a":1}\n\n'])).toEqual([{ event: 'quote', data: '{"a":1}' }]);
    expect(parseAll(['event: quote\ndata:  two\n\n'])).toEqual([{ event: 'quote', data: ' two' }]);
  });

  it('ignores unknown fields (id, retry, custom)', () => {
    expect(parseAll(['id: 7\nretry: 100\nfoo: bar\nevent: quote\ndata: {}\n\n'])).toEqual([{ event: 'quote', data: '{}' }]);
  });

  it('ignores frames without data', () => {
    expect(parseAll(['event: ping\n\nevent: quote\ndata: {}\n\n'])).toEqual([{ event: 'quote', data: '{}' }]);
  });

  it('defaults the event name to "message"', () => {
    expect(parseAll(['data: hi\n\n'])).toEqual([{ event: 'message', data: 'hi' }]);
  });

  it('flush emits a trailing frame that lacks the final blank line', () => {
    expect(parseAll(['event: end\ndata: {}\n'])).toEqual([{ event: 'end', data: '{}' }]);
    expect(parseAll(['event: end\ndata: {}'])).toEqual([{ event: 'end', data: '{}' }]);
  });
});
