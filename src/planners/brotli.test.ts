import { readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { initSync } from 'brotli-dec-wasm/web';
import { describe, expect, it } from 'vitest';

/**
 * Hand the decoder its wasm before anything asks it to find its own.
 *
 * Left to itself it fetches `brotli_dec_wasm_bg.wasm` relative to its module, which in a browser is
 * an http request and here would be a `file:` one — which node's fetch does not do. `initSync` is
 * the same wasm by another route, and the module remembers it, so the loader below finds it ready
 * and never goes looking.
 */
initSync({
  module: readFileSync(
    new URL('../../node_modules/brotli-dec-wasm/pkg/brotli_dec_wasm_bg.wasm', import.meta.url),
  ),
});

import { brotliDecompress, brotliDecompressionStream, looksBrotli, readable } from './brotli';

/** A pattern file's shape: front-coding counts and three-letter codes, one line each. */
const PATTERNS = Array.from(
  { length: 4000 },
  (_, i) => `${i % 10}LST${String(i).padStart(3, '0').slice(0, 3)}`,
).join('\n');

const compressed = new Uint8Array(brotliCompressSync(Buffer.from(PATTERNS)));
const utf8 = new TextDecoder();

/** A stream of `size` byte chunks, so the decoder is fed the way a download would feed it. */
function chunked(bytes: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let at = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (at >= bytes.length) return controller.close();
      controller.enqueue(bytes.subarray(at, at + size));
      at += size;
    },
  });
}

const collect = async (stream: ReadableStream<Uint8Array>): Promise<string> =>
  utf8.decode(new Uint8Array(await new Response(stream).arrayBuffer()));

describe('looksBrotli', () => {
  it('leaves gzip alone, which every environment can read', () => {
    expect(looksBrotli(new Uint8Array(gzipSync(Buffer.from(PATTERNS))).subarray(0, 4))).toBe(false);
  });

  it('leaves a plain file alone, which starts with a front-coding count', () => {
    expect(looksBrotli(new TextEncoder().encode('0LSTNRW\n'))).toBe(false);
  });

  it('claims a brotli file, which starts as neither', () => {
    expect(looksBrotli(compressed.subarray(0, 4))).toBe(true);
  });

  it('says nothing about nothing', () => {
    expect(looksBrotli(new Uint8Array(0))).toBe(false);
  });
});

describe('brotliDecompress', () => {
  it('reads a whole file, as the per-station ones are read', async () => {
    expect(utf8.decode(await brotliDecompress(compressed))).toBe(PATTERNS);
  });
});

describe('brotliDecompressionStream', () => {
  // The interesting case: one chunk in is many out, so the decoder has to be drained.
  it.each([1, 17, 1024, compressed.length])('decompresses in %i byte chunks', async (size) => {
    expect(await collect(chunked(compressed, size).pipeThrough(brotliDecompressionStream()))).toBe(
      PATTERNS,
    );
  });
});

describe('readable', () => {
  it('decompresses a brotli file', async () => {
    expect(await collect(await readable(chunked(compressed, 512)))).toBe(PATTERNS);
  });

  it('passes a plain file through, sniffed bytes and all', async () => {
    const plain = new TextEncoder().encode(PATTERNS);
    expect(await collect(await readable(chunked(plain, 512)))).toBe(PATTERNS);
  });

  it('passes gzip through for the environment to handle', async () => {
    const gz = new Uint8Array(gzipSync(Buffer.from(PATTERNS)));
    const out = new Uint8Array(await new Response(await readable(chunked(gz, 512))).arrayBuffer());
    expect(out).toEqual(gz);
  });

  it('reads a file shorter than the sniff', async () => {
    const tiny = new Uint8Array(brotliCompressSync(Buffer.from('0LST')));
    expect(await collect(await readable(chunked(tiny, 2)))).toBe('0LST');
  });
});
