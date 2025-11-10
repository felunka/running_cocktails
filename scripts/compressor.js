// Compressor: prefer brotli-wasm (lazy loaded) for compression in browser,
// fall back to gzip CompressionStream if brotli wasm is not available.
// Encoded strings are returned as URL-safe base64 with a short prefix
// indicating algorithm: "br:" for brotli, "gz:" for gzip. This keeps
// backward-compatibility and lets decode pick correct method.

export class Compressor {
  static _brotli = null;
  static _brotliReady = null;

  // Lazy-load brotli-wasm from unpkg (module URL provided by user)
  static async _ensureBrotli() {
    if (this._brotliReady) return this._brotliReady;
    this._brotliReady = (async () => {
      try {
        const mod = await import('https://unpkg.com/brotli-wasm@3.0.0/index.web.js?module');
        // Some builds export a default that is itself a promise or a factory function.
        let brot = mod && mod.default ? mod.default : mod;
        if (brot && typeof brot.then === 'function') {
          // default is a Promise that resolves to the API
          brot = await brot;
        } else if (typeof brot === 'function') {
          // default might be a factory; try calling it (may return a promise)
          try {
            const maybe = brot();
            if (maybe && typeof maybe.then === 'function') brot = await maybe;
            else if (maybe) brot = maybe;
          } catch (err) {
            // ignore and keep brot as-is
          }
        }
        this._brotli = brot;
        // Normalize various possible WASM API shapes into adapter functions
        this._brotliCompress = null;
        this._brotliDecompress = null;
        if (this._brotli) {
          // Common shapes: { compress(u8, opts) }, { compressSync }, { encode }, { BrotliCompress }
          if (typeof this._brotli.compress === 'function') {
            this._brotliCompress = (u8, opts) => this._brotli.compress(u8, opts);
          } else if (typeof this._brotli.compressSync === 'function') {
            this._brotliCompress = (u8, opts) => this._brotli.compressSync(u8, opts);
          } else if (typeof this._brotli.encode === 'function') {
            this._brotliCompress = (u8, opts) => this._brotli.encode(u8, opts);
          } else if (typeof this._brotli.BrotliCompress === 'function') {
            this._brotliCompress = (u8, opts) => this._brotli.BrotliCompress(u8, opts);
          }

          if (typeof this._brotli.decompress === 'function') {
            this._brotliDecompress = (u8) => this._brotli.decompress(u8);
          } else if (typeof this._brotli.decompressSync === 'function') {
            this._brotliDecompress = (u8) => this._brotli.decompressSync(u8);
          } else if (typeof this._brotli.decode === 'function') {
            this._brotliDecompress = (u8) => this._brotli.decode(u8);
          } else if (typeof this._brotli.BrotliDecompress === 'function') {
            this._brotliDecompress = (u8) => this._brotli.BrotliDecompress(u8);
          }
        }
      } catch (e) {
        console.warn('Failed to load brotli-wasm:', e);
        this._brotli = null;
      }
    })();
    return this._brotliReady;
  }

  // Read a ReadableStream<Uint8Array> fully into a Uint8Array
  static async readAllBytes(readable) {
    const reader = readable.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  // Helpers for base64 and base64url
  static uint8ToBase64(u8) {
    const CHUNK_SIZE = 0x8000;
    let index = 0;
    const parts = [];
    while (index < u8.length) {
      const slice = u8.subarray(index, Math.min(index + CHUNK_SIZE, u8.length));
      parts.push(String.fromCharCode.apply(null, slice));
      index += CHUNK_SIZE;
    }
    return btoa(parts.join(''));
  }

  static base64ToBase64Url(b64) {
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  static base64UrlToBase64(b64url) {
    const pad = (4 - (b64url.length % 4)) % 4;
    return (b64url + '='.repeat(pad)).replace(/-/g, '+').replace(/_/g, '/');
  }

  static base64ToUint8(b64) {
    const binary = atob(b64);
    const len = binary.length;
    const u8 = new Uint8Array(len);
    for (let i = 0; i < len; i++) u8[i] = binary.charCodeAt(i);
    return u8;
  }

  // Check native CompressionStream algorithm support
  static supportsCompressionAlgorithm(alg) {
    if (typeof CompressionStream === 'undefined') return false;
    try {
      // some browsers throw immediately
      new CompressionStream(alg);
      return true;
    } catch (e) {
      return false;
    }
  }

  // Public: compress JSON string and return url-safe base64 with prefix
  // Prefers brotli-wasm (br:), falls back to gzip (gz:)
  static async encode(jsonStr) {
    // Try brotli wasm first
    await this._ensureBrotli();
    if (this._brotli && typeof this._brotliCompress === 'function') {
      try {
        // brotli-wasm typically accepts Uint8Array and returns Uint8Array
        const input = new TextEncoder().encode(jsonStr);
        // default quality: 11 (max) — you can tune for size/speed
        let compressed = this._brotliCompress(input, { quality: 11 });
        if (compressed instanceof Promise) compressed = await compressed;
        const b64 = this.uint8ToBase64(compressed);
        return 'br:' + this.base64ToBase64Url(b64);
      } catch (e) {
        console.warn('brotli-wasm compress failed, falling back to gzip:', e);
        // fall through to gzip
      }
    }

    // Gzip fallback using CompressionStream if available
    if (typeof CompressionStream !== 'undefined' && this.supportsCompressionAlgorithm('gzip')) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const compressedStream = blob.stream().pipeThrough(new CompressionStream('gzip'));
      const compressedBytes = await this.readAllBytes(compressedStream);
      const b64 = this.uint8ToBase64(compressedBytes);
      return 'gz:' + this.base64ToBase64Url(b64);
    }

    // Last resort: no compression available — return url-encoded JSON (unsafe for long)
    return 'raw:' + encodeURIComponent(jsonStr);
  }

  // Public: decode an encoded string produced by encode().
  // Accepts strings prefixed with br:, gz:, raw:, or legacy base64/base64url without prefix (assume gzip)
  static async decode(encodedStr) {
    if (encodedStr.startsWith('br:')) {
      const b64url = encodedStr.slice(3);
      const b64 = this.base64UrlToBase64(b64url);
      const compressed = this.base64ToUint8(b64);
      // Ensure brotli available
      await this._ensureBrotli();
      if (!this._brotli || typeof this._brotliDecompress !== 'function') throw new Error('brotli not available to decompress');
      let decompressed = this._brotliDecompress(compressed);
      if (decompressed instanceof Promise) decompressed = await decompressed;
      return new TextDecoder().decode(decompressed);
    }

    if (encodedStr.startsWith('gz:')) {
      const b64url = encodedStr.slice(3);
      const b64 = this.base64UrlToBase64(b64url);
      const compressed = this.base64ToUint8(b64);
      const blob = new Blob([compressed], { type: 'application/gzip' });
      if (typeof DecompressionStream !== 'undefined' && this.supportsCompressionAlgorithm('gzip')) {
        const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
        const bytes = await this.readAllBytes(decompressedStream);
        return new TextDecoder().decode(bytes);
      }
      throw new Error('gzip decompression not supported in this environment');
    }

    if (encodedStr.startsWith('raw:')) {
      return decodeURIComponent(encodedStr.slice(4));
    }

    // Legacy: no prefix — accept both base64url and base64; assume gzip
    const maybeB64 = encodedStr.indexOf('-') !== -1 || encodedStr.indexOf('_') !== -1
      ? this.base64UrlToBase64(encodedStr)
      : encodedStr;
    const compressed = this.base64ToUint8(maybeB64);
    const blob = new Blob([compressed], { type: 'application/gzip' });
    if (typeof DecompressionStream !== 'undefined' && this.supportsCompressionAlgorithm('gzip')) {
      const decompressedStream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      const bytes = await this.readAllBytes(decompressedStream);
      return new TextDecoder().decode(bytes);
    }
    throw new Error('cannot decode: unknown format and no decompression available');
  }
}
