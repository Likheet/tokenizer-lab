import { init as initTiktoken, Tiktoken } from '@dqbd/tiktoken/lite/init';
import wasmUrl from '@dqbd/tiktoken/lite/tiktoken_bg.wasm?url';
import claudeRegistry from '@anthropic-ai/tokenizer/claude.json' assert { type: 'json' };

export const TIKTOKEN_VERSION = '1.0.22';
export const TRANSFORMERS_JS_VERSION = '2.17.2';
export const ANTHROPIC_TOKENIZER_VERSION = '0.0.4';

export const TIKTOKEN_WASM_URL = wasmUrl;
const TRANSFORMERS_CDN_URL = `https://cdn.jsdelivr.net/npm/@xenova/transformers@${TRANSFORMERS_JS_VERSION}/dist/transformers.min.js`;

const isDevelopment = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.DEV);
const debugLog = (...args: unknown[]): void => {
  if (isDevelopment) {
    console.debug(...args);
  }
};

let transformersLoadPromise: Promise<any> | null = null;

let huggingFaceFetchPatched = false;

function resolveRequestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.url;
  }
  return null;
}

function isLikelyHuggingFaceAsset(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase().endsWith('huggingface.co') && parsed.pathname.includes('/resolve/');
  } catch {
    return false;
  }
}

function appendDownloadQuery(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has('download')) {
      return null;
    }
    parsed.searchParams.set('download', '1');
    return parsed.toString();
  } catch {
    return null;
  }
}

function createFallbackRequest(input: RequestInfo | URL, fallbackUrl: string): RequestInfo | URL {
  if (typeof input === 'string' || input instanceof URL) {
    return fallbackUrl;
  }
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return new Request(fallbackUrl, input);
  }
  return fallbackUrl;
}

function shouldRetryWithDownload(response: Response): boolean {
  if (!response) return false;
  if (!response.ok) return true;
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType) return false;
  return contentType.includes('text/html');
}

function patchFetchForHuggingFace(): void {
  if (huggingFaceFetchPatched) return;
  if (typeof fetch !== 'function') return;

  const originalFetch = fetch.bind(globalThis);

  const wrappedFetch: typeof fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = resolveRequestUrl(input);
    let response = await originalFetch(input, init);

    if (url && isLikelyHuggingFaceAsset(url) && shouldRetryWithDownload(response)) {
      const fallbackUrl = appendDownloadQuery(url);
      if (fallbackUrl && fallbackUrl !== url) {
        try {
          if (response.body && typeof response.body.cancel === 'function') {
            await response.body.cancel();
          }
        } catch {
          // ignore cancellation errors
        }
        console.warn(`Retrying Hugging Face fetch with download=1: ${url}`);
        const fallbackInput = createFallbackRequest(input, fallbackUrl);
        response = await originalFetch(fallbackInput, init);
      }
    }

    return response;
  };

  globalThis.fetch = wrappedFetch;
  huggingFaceFetchPatched = true;
}

patchFetchForHuggingFace();

function readHfGlobal(): any | undefined {
  if (typeof globalThis !== 'undefined' && (globalThis as any).hf) {
    return (globalThis as any).hf;
  }
  if (typeof window !== 'undefined' && (window as any).hf) {
    return (window as any).hf;
  }
  if (typeof self !== 'undefined' && (self as any).hf) {
    return (self as any).hf;
  }
  return undefined;
}

async function loadTransformersFromCdn(): Promise<any> {
  const module = await import(/* @vite-ignore */ TRANSFORMERS_CDN_URL);
  const { env, AutoTokenizer } = module as { env: any; AutoTokenizer: any };

  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  env.useBrowserCache = true;

  const originalTemplate = typeof env.remoteURLTemplate === 'function' ? env.remoteURLTemplate : null;
  env.remoteURLTemplate = (...args: any[]) => {
    let url: string | null = null;
    if (originalTemplate) {
      try {
        url = originalTemplate(...args);
      } catch (error) {
        console.warn('remoteURLTemplate threw an error, falling back to default behavior:', error);
      }
    }

    if (typeof url !== 'string' || url.length === 0) {
      const [modelId, fileName, revision] = args;
      if (typeof modelId === 'string' && typeof fileName === 'string') {
        const rev = typeof revision === 'string' && revision.length > 0 ? revision : 'main';
        url = `https://huggingface.co/${modelId}/resolve/${rev}/${fileName}`;
      }
    }

    if (typeof url === 'string' && url.includes('huggingface.co')) {
      try {
        const parsed = new URL(url);
        if (!parsed.searchParams.has('download')) {
          parsed.searchParams.set('download', '1');
        }
        return parsed.toString();
      } catch (error) {
        console.warn('Failed to append download=1 to remote URL:', error);
      }
    }

    if (typeof url === 'string') {
      return url;
    }

    return '';
  };

  if (typeof globalThis.fetch === 'function') {
    env.fetch = globalThis.fetch.bind(globalThis);
  }

  const existing = readHfGlobal() ?? {};
  const merged = {
    ...existing,
    env,
    AutoTokenizer
  };

  if (typeof globalThis !== 'undefined') {
    (globalThis as any).hf = merged;
  }
  if (typeof window !== 'undefined') {
    (window as any).hf = merged;
  }
  if (typeof self !== 'undefined') {
    (self as any).hf = merged;
  }

  return merged;
}

// --- helpers ---
function toIds(enc: any): number[] {
  if (Array.isArray(enc)) return enc as number[];
  return Array.from(enc?.input_ids ?? enc?.inputIds ?? []);
}
function toOffsets(enc: any): [number, number][] {
  const raw = enc?.offset_mapping ?? enc?.offsets ?? [];
  return raw.map((p: any) => [p[0], p[1]] as [number, number]);
}
function visWS(s: string) {
  // show whitespace but keep real letters for any script
  return s.replace(/ /g, '␣').replace(/\t/g, '⇥').replace(/\n/g, '⏎');
}

const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF]/g;

function stripZeroWidth(text: string): string {
  return text.replace(ZERO_WIDTH_REGEX, '');
}

function sanitizeString(text: string): string {
  const withoutControl = text.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  const normalized = withoutControl.normalize('NFC');
  return stripZeroWidth(normalized);
}

function countGraphemes(value: string): number {
  if (typeof Intl !== 'undefined' && typeof (Intl as any).Segmenter === 'function') {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    return [...segmenter.segment(value)].length;
  }
  return Array.from(value).length;
}

function countCodePoints(value: string): number {
  return Array.from(value).length;
}

function countUtf8Bytes(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  let total = 0;
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x7f) total += 1;
    else if (code <= 0x7ff) total += 2;
    else if (code <= 0xffff) total += 3;
    else total += 4;
  }
  return total;
}

function normalizeTokenForStats(token: unknown): string {
  return String(token ?? '').replace(/[␣⇥⏎]/g, ' ');
}

function computeTokenLengthSummary(tokens: string[]): { lengths: number[]; sum: number; entropy: number } {
  if (!tokens.length) {
    return { lengths: [], sum: 0, entropy: 0 };
  }

  const lengths = tokens.map((token) => {
    const clean = normalizeTokenForStats(token);
    const length = countGraphemes(clean);
    return Number.isFinite(length) && length >= 0 ? length : 0;
  });

  const sum = lengths.reduce((acc, value) => acc + value, 0);
  const histogram = new Map<number, number>();
  for (const len of lengths) {
    histogram.set(len, (histogram.get(len) ?? 0) + 1);
  }

  let entropy = 0;
  const total = lengths.length;
  histogram.forEach((count) => {
    if (count <= 0) return;
    const probability = count / total;
    entropy -= probability * Math.log2(probability);
  });

  return { lengths, sum, entropy };
}

const BYTE_DECODER: Map<string, number> = (() => {
  const bs: number[] = [];
  const cs: number[] = [];

  for (let i = 33; i <= 126; i++) {
    bs.push(i);
    cs.push(i);
  }
  for (let i = 161; i <= 172; i++) {
    bs.push(i);
    cs.push(i);
  }
  for (let i = 174; i <= 255; i++) {
    bs.push(i);
    cs.push(i);
  }

  let n = 0;
  for (let b = 0; b < 256; b++) {
    if (!bs.includes(b)) {
      bs.push(b);
      cs.push(256 + n);
      n++;
    }
  }

  const decoder = new Map<string, number>();
  for (let i = 0; i < bs.length; i++) {
    decoder.set(String.fromCharCode(cs[i]), bs[i]);
  }
  return decoder;
})();

const utf8Decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : undefined;

const REPLACEMENT_REGEX = /\uFFFD|�/u;

function hasReplacementChar(value?: string): boolean {
  return !!value && REPLACEMENT_REGEX.test(value);
}

function bytesToHex(bytes?: Uint8Array): string | undefined {
  if (!bytes || bytes.length === 0) return undefined;
  return '0x' + Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function makeReadableToken(
  str: string | undefined,
  options: { fallback?: string; bytes?: Uint8Array } = {}
): string {
  const { fallback, bytes } = options;
  if (str && !hasReplacementChar(str)) return str;
  if (fallback && !hasReplacementChar(fallback)) return fallback;
  const hex = bytesToHex(bytes);
  if (hex) return hex;
  if (str) {
    const cleaned = str.replace(REPLACEMENT_REGEX, '').trim();
    if (cleaned) return cleaned;
  }
  return '⍰';
}

async function inferTokenizerVocabSize(tokenizer: any): Promise<number | null> {
  if (!tokenizer) return null;

  const register = (value: unknown): number | null => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
    return null;
  };

  const readNumericProps = (target: any, props: string[]): number | null => {
    if (!target) return null;
    for (const prop of props) {
      try {
        const resolved = register(target?.[prop]);
        if (resolved !== null) {
          return resolved;
        }
      } catch (error) {
        console.warn(`Failed to read numeric property ${prop}:`, error);
      }
    }
    return null;
  };

  try {
    if (typeof tokenizer.get_vocab_size === 'function') {
      const size = await tokenizer.get_vocab_size();
      const resolved = register(size);
      if (resolved !== null) {
        return resolved;
      }
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.get_vocab_size():', error);
  }

  try {
    if (typeof tokenizer.vocab_size === 'number') {
      const resolved = register(tokenizer.vocab_size);
      if (resolved !== null) {
        return resolved;
      }
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.vocab_size:', error);
  }

  const maybeObjectCount = (vocab: unknown): number | null => {
    if (!vocab) return null;
    if (vocab instanceof Map) {
      return register(vocab.size);
    }
    if (typeof vocab === 'object') {
      try {
        const keys = Object.keys(vocab as Record<string, unknown>);
        return register(keys.length);
      } catch (error) {
        console.warn('Failed to derive vocab size from object:', error);
      }
    }
    return null;
  };

  try {
    if (typeof tokenizer.get_vocab === 'function') {
      const vocab = await tokenizer.get_vocab();
      const resolved = maybeObjectCount(vocab);
      if (resolved !== null) {
        return resolved;
      }
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.get_vocab():', error);
  }

  try {
    const resolved = maybeObjectCount(tokenizer.vocab);
    if (resolved !== null) {
      return resolved;
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.vocab:', error);
  }

  try {
    const resolved = maybeObjectCount(tokenizer?.config?.vocab);
    if (resolved !== null) {
      return resolved;
    }
    const configSize = register(tokenizer?.config?.vocab_size);
    if (configSize !== null) {
      return configSize;
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.config vocab info:', error);
  }

  try {
    const modelSize = register(tokenizer?.model?.vocab_size);
    if (modelSize !== null) {
      return modelSize;
    }
  } catch (error) {
    console.warn('Failed to read tokenizer.model.vocab_size:', error);
  }

  const numericTargets: any[] = [
    tokenizer,
    tokenizer?.tokenizer,
    tokenizer?.tokenizer?.model,
    tokenizer?.processor,
    tokenizer?.processor?.tokenizer,
    tokenizer?.processor?.tokenizer?.model,
    tokenizer?.model,
    tokenizer?.sp_model,
    tokenizer?.spModel
  ];

  const numericProps = ['vocab_size', 'vocabSize', 'vocabularySize', 'size'];
  for (const target of numericTargets) {
    const resolved = readNumericProps(target, numericProps);
    if (resolved !== null) {
      return resolved;
    }
  }

  for (const target of numericTargets) {
    if (!target) continue;
    try {
      if (typeof target.get_vocab_size === 'function') {
        const size = await target.get_vocab_size();
        const resolved = register(size);
        if (resolved !== null) {
          return resolved;
        }
      }
    } catch (error) {
      console.warn('Failed to read nested get_vocab_size():', error);
    }

    try {
      if (typeof target.get_vocab === 'function') {
        const nestedVocab = await target.get_vocab();
        const resolved = maybeObjectCount(nestedVocab);
        if (resolved !== null) {
          return resolved;
        }
      }
    } catch (error) {
      console.warn('Failed to read nested get_vocab():', error);
    }

    try {
      if (typeof target.getPieceSize === 'function') {
        const size = target.getPieceSize();
        const resolved = register(size);
        if (resolved !== null) {
          return resolved;
        }
      }
    } catch (error) {
      console.warn('Failed to read getPieceSize():', error);
    }
  }

  return null;
}

async function ensureModelVocabSize(model: ModelInfo, tokenizer: any): Promise<number | null> {
  if (typeof model.vocabSize === 'number' && Number.isFinite(model.vocabSize) && model.vocabSize > 0) {
    return model.vocabSize;
  }
  const inferred = await inferTokenizerVocabSize(tokenizer);
  if (typeof inferred === 'number' && Number.isFinite(inferred) && inferred > 0) {
    model.vocabSize = inferred;
    return inferred;
  }
  return model.vocabSize ?? null;
}

function decodeByteToken(token: string): string {
  if (!utf8Decoder) return token;
  const bytes = new Uint8Array([...String(token)].map((ch) => BYTE_DECODER.get(ch) ?? ch.charCodeAt(0)));
  try {
    const decoded = utf8Decoder.decode(bytes);
    return makeReadableToken(decoded, { bytes });
  } catch {
    return makeReadableToken(undefined, { bytes });
  }
}

// Returns the Hugging Face token to use for gated downloads.
// 1. If a token is stored in localStorage, use it.
// 2. Otherwise, fall back to the worker-injected token (if any).
export function readStoredHfToken(): string | undefined {
  if (typeof window !== 'undefined') {
    try {
      const value = window.localStorage?.getItem('hf_token');
      const trimmed = value?.trim();
      if (trimmed) {
        return trimmed;
      }
    } catch (error) {
      console.warn('Unable to access localStorage for HF token:', error);
    }
  }

  if (typeof globalThis !== 'undefined') {
    const globalToken = (globalThis as any).__HF_ACCESS_TOKEN;
    if (typeof globalToken === 'string' && globalToken.trim().length > 0) {
      return globalToken.trim();
    }

    const envToken = (globalThis as any)?.hf?.env?.accessToken;
    if (typeof envToken === 'string' && envToken.trim().length > 0) {
      return envToken.trim();
    }
  }

  return undefined;
}

// Utility to get the token ID (first 10 chars, masked)
export function getHfTokenId(): string {
  const token = readStoredHfToken();
  if (!token) return '';
  return token.slice(0, 10) + '...';
}

type TiktokenEncoderConfig = { bpe_ranks: string; special_tokens: Record<string, number>; pat_str: string };

const localEncoderCache = new Map<string, Promise<TiktokenEncoderConfig>>();
const LOCAL_TIKTOKEN_ENCODINGS: Record<string, () => Promise<TiktokenEncoderConfig>> = {
  cl100k_base: () => import('@dqbd/tiktoken/encoders/cl100k_base').then((m) => m.default as TiktokenEncoderConfig),
  o200k_base: () => import('@dqbd/tiktoken/encoders/o200k_base').then((m) => m.default as TiktokenEncoderConfig)
};

let tiktokenInitPromise: Promise<void> | null = null;
const tiktokenCache = new Map<string, Promise<Tiktoken>>();
const transformersTokenizerCache = new Map<string, Promise<any>>();
const gatedRepoPreflightCache = new Set<string>();

async function instantiateWasm(imports: WebAssembly.Imports) {
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      return await WebAssembly.instantiateStreaming(fetch(wasmUrl), imports);
    } catch (error) {
      console.warn('tiktoken instantiateStreaming failed, falling back to ArrayBuffer.', error);
    }
  }
  const response = await fetch(wasmUrl);
  const bytes = await response.arrayBuffer();
  return WebAssembly.instantiate(bytes, imports);
}

async function ensureTiktokenReady(): Promise<void> {
  if (!tiktokenInitPromise) {
    tiktokenInitPromise = initTiktoken((imports) => instantiateWasm(imports));
  }
  await tiktokenInitPromise;
}

async function getTiktokenEncoding(encodingId: string): Promise<Tiktoken> {
  const existing = tiktokenCache.get(encodingId);
  if (existing) return existing;

  const created = (async () => {
    await ensureTiktokenReady();
    if (encodingId === 'anthropic-claude') {
      const config = claudeRegistry as unknown as {
        bpe_ranks: string;
        special_tokens: Record<string, number>;
        pat_str: string;
      };
      return new Tiktoken(config.bpe_ranks, config.special_tokens, config.pat_str);
    }

    const loader = LOCAL_TIKTOKEN_ENCODINGS[encodingId];
    if (loader) {
      let configPromise = localEncoderCache.get(encodingId);
      if (!configPromise) {
        configPromise = loader();
        localEncoderCache.set(encodingId, configPromise);
      }
      const localConfig = await configPromise;
      return new Tiktoken(localConfig.bpe_ranks, localConfig.special_tokens, localConfig.pat_str);
    }

    throw new Error(`Unknown or unsupported tiktoken encoding: ${encodingId}.`);
  })();

  tiktokenCache.set(encodingId, created);
  return created;
}

async function tokenizeWithTiktokenModel(model: ModelInfo, text: string): Promise<TokenizationResult> {
  if (!model.encoding) {
    throw new Error(`Model ${model.id} is missing a tiktoken encoding identifier.`);
  }
  const tokenizer = await getTiktokenEncoding(model.encoding);
  const normalized = text.normalize('NFC');
  const encoded = tokenizer.encode(normalized, 'all');
  const ids = Array.from(encoded);

  let vocabSize = typeof model.vocabSize === 'number' ? model.vocabSize : null;
  if (!vocabSize) {
    const nVocab = (tokenizer as any)?.n_vocab;
    if (typeof nVocab === 'number' && Number.isFinite(nVocab) && nVocab > 0) {
      vocabSize = nVocab;
      model.vocabSize = nVocab;
    }
  }

  const tokenBytesList: (Uint8Array | undefined)[] = [];
  const rawPieces = ids.map((id, index) => {
    try {
      const bytes = tokenizer.decode_single_token_bytes(id);
      tokenBytesList[index] = bytes;
      const decoded = utf8Decoder ? utf8Decoder.decode(bytes) : undefined;
      return makeReadableToken(decoded, { bytes });
    } catch (error) {
      console.warn(`Failed to decode token ${id} for model ${model.id}:`, error);
      tokenBytesList[index] = undefined;
      return makeReadableToken(undefined, {});
    }
  });

  const displayTokens: string[] = [];
  const offsets: [number, number][] = [];
  let prev = '';

  for (let i = 0; i < encoded.length; i++) {
    let current = prev;
    try {
      const partial = encoded.subarray(0, i + 1);
      const decodedBytes = tokenizer.decode(partial);
      current = utf8Decoder ? utf8Decoder.decode(decodedBytes) : prev;
    } catch (error) {
      console.warn(`Failed to decode prefix for token ${i} (${model.id}):`, error);
    }

    const slice = current.slice(prev.length);
    const bytes = tokenBytesList[i];
    const fallback = rawPieces[i] ?? '';
    const readable = makeReadableToken(slice, { fallback, bytes });
    displayTokens.push(visWS(readable));
    offsets.push([prev.length, current.length]);
    prev = current;
  }

  const graphemeCount = countGraphemes(normalized);
  const codePointCount = countCodePoints(normalized);
  const byteCount = countUtf8Bytes(normalized);
  const tokenCount = ids.length;
  const safeDivisor = Math.max(1, tokenCount);
  const { sum: tokenGraphemeSum, entropy: fragEntropy } = computeTokenLengthSummary(displayTokens);
  const avgTokenGraphemes = tokenGraphemeSum / safeDivisor;

  // UNK Detection for tiktoken models
  // Tiktoken models generally don't have UNK tokens (they use byte-fallback)
  // but we should still check the token strings just in case
  const unkCount = 0;
  const unkPercentage = 0;
  const tokensPer100Graphemes = graphemeCount > 0 ? (tokenCount / graphemeCount) * 100 : 0;
  const tokensPer100CodePoints = codePointCount > 0 ? (tokenCount / codePointCount) * 100 : 0;

  return {
    ids,
    tokens: displayTokens,
    tokenStrings: rawPieces,
    offsets: offsets.length === ids.length ? offsets : undefined,
    vocabSize,
    metrics: {
      tokenCount,
      graphemeCount,
      charCount: graphemeCount,
      codePointCount,
      byteCount,
      tokensPer100Chars: tokensPer100Graphemes,
      tokensPer100Graphemes,
      tokensPer100CodePoints,
      bytesPerToken: byteCount / safeDivisor,
      avgTokenLength: avgTokenGraphemes,
      fragEntropy,
      unkCount,
      unkPercentage
    }
  };
}

// Build readable tokens for ANY tokenizer
export async function displayTokensFor(
  tok: any, text: string, ids: number[], enc?: any
): Promise<string[]> {
  // 1) Use offsets if available
  const offsets = enc ? toOffsets(enc) : [];
  if (offsets.length === ids.length && offsets.length > 0) {
    return offsets.map(([s, e]) => visWS(text.slice(s, e) || '∅'));
  }

  let convertedTokens: string[] | undefined = undefined;
  try {
    convertedTokens = typeof tok?.convert_ids_to_tokens === 'function' ? tok.convert_ids_to_tokens(ids) : undefined;
  } catch (error) {
    console.warn('convert_ids_to_tokens failed in displayTokensFor:', error);
  }
  if (!Array.isArray(convertedTokens)) {
    convertedTokens = undefined;
  }

  // 2) If the tokenizer provides raw token strings (e.g., byte-level BPE), decode them
  const rawTokenStrings: string[] = Array.isArray((enc as any)?.tokens)
    ? Array.from((enc as any).tokens)
    : [];
  if (rawTokenStrings.length === ids.length && rawTokenStrings.length > 0) {
    return rawTokenStrings.map((token, i) => {
      const decoded = decodeByteToken(token);
      let readable = makeReadableToken(decoded, { fallback: convertedTokens?.[i] });
      if (readable === '⍰') {
        // Fall back to the raw token string so we surface byte-level hints instead of an unknown glyph
        readable = makeReadableToken(token, { fallback: convertedTokens?.[i] });
      }
      return visWS(readable);
    });
  }

  // 3) Incremental-decode diff as a fallback (works for GPT-2 byte-BPE etc.)
  const out: string[] = [];
  let prev = '';
  for (let i = 0; i < ids.length; i++) {
    const convertedFallback = Array.isArray(convertedTokens) ? convertedTokens[i] : undefined;
    try {
      const cur = tok.decode(ids.slice(0, i + 1), { skip_special_tokens: false });
      const diff = cur.slice(prev.length) || '';
      const readableDiff = makeReadableToken(diff, { fallback: convertedFallback });
      out.push(visWS(readableDiff));
      prev = cur;
    } catch (error) {
      // If decode fails, try individual token decode as fallback
      try {
        const single = tok.decode([ids[i]], { skip_special_tokens: false });
        const readableSingle = makeReadableToken(single, { fallback: convertedFallback });
        out.push(visWS(readableSingle));
      } catch (individualError) {
        // Last resort: Use the converted token if available, or show as UNK-like token
        console.warn(`Failed to decode token ${ids[i]} (index ${i}):`, individualError);
        if (convertedFallback && convertedFallback !== '⍰') {
          out.push(visWS(convertedFallback));
        } else {
          // Mark as UNK if we can't decode it
          out.push(visWS('<UNK>'));
        }
      }
    }
  }
  return out;
}

// Wait for Transformers.js to load
function waitForTransformers(): Promise<any> {
  const existing = readHfGlobal();
  if (existing?.env && existing?.AutoTokenizer) {
    return Promise.resolve(existing);
  }

  if (!transformersLoadPromise) {
    transformersLoadPromise = loadTransformersFromCdn().catch((error) => {
      transformersLoadPromise = null;
      throw error;
    });
  }

  return transformersLoadPromise;
}

export function sanitizeAndValidateInput(input: unknown): string {
  const rawText = String(input ?? '');
  const sanitized = sanitizeString(rawText);
  if (!sanitized.trim()) {
    throw new Error('Empty text provided');
  }
  return sanitized;
}

export type ModelCategory = 'basic' | 'indian' | 'frontier';
export type ModelImplementation = 'transformers' | 'tiktoken';
export type TokenizerFamily = 'WordPiece' | 'SentencePiece' | 'ByteBPE' | 'Tiktoken' | 'Unspecified';

export interface ModelInfo {
  id: string;
  name: string;
  shortName: string;
  category: ModelCategory;
  implementation?: ModelImplementation;
  encoding?: string; // used by tiktoken-backed models
  family?: TokenizerFamily;
  vocabSize?: number | null;
}

export interface TokenizationResult {
  ids: number[];
  tokens: string[];
  tokenStrings?: string[]; // model's raw token strings when available (e.g., WordPiece/SentencePiece)
  offsets?: [number, number][]; // start,end character offsets in original text when available
  vocabSize?: number | null;
  unkTokenSamples?: { id: number; token: string }[];
  metrics: {
    tokenCount: number;
    graphemeCount: number;
    charCount: number;
    codePointCount: number;
    byteCount: number;
    tokensPer100Chars: number;
    tokensPer100Graphemes: number;
    tokensPer100CodePoints: number;
    bytesPerToken: number;
    avgTokenLength: number;
    fragEntropy: number;
    unkCount: number;
    unkPercentage: number;
  };
}

// Check if a repo is likely gated and requires accepting terms
function isLikelyGatedRepo(repo: string): boolean {
  const lower = repo.toLowerCase();
  return (
    lower.startsWith('mistralai/') ||
    lower.startsWith('meta-llama/') ||
    lower.startsWith('anthropic/') // add others if needed
  );
}

// Preflight check: ensure we can access a known file from the repo with current token
async function preflightHFRepoAccess(repo: string, hfToken?: string): Promise<void> {
  try {
    const url = `https://huggingface.co/${repo}/resolve/main/tokenizer_config.json`;
    const headers = new Headers();
    if (hfToken) {
      headers.set('Authorization', `Bearer ${hfToken}`);
    }
    const res = await fetch(url, { method: 'HEAD', headers });
    if (res.status === 401 || res.status === 403) {
      const masked = hfToken ? `${hfToken.slice(0, 10)}...` : 'none';
      throw new Error(
        `Unauthorized (HTTP ${res.status}). Your HF token (${masked}) is valid format but does not have access to ${repo}.\n` +
        `To fix this: 1) Log in to Hugging Face as the account that owns this token, 2) Open https://huggingface.co/${repo}, 3) Click \"Access repository\" or \"Agree and Access\" to accept the license terms, 4) Retry here.\n` +
        `Note: Token scope (read/write) is separate from per-repository access approval.`
      );
    }
    if (!res.ok) {
      throw new Error(`Preflight check failed for ${repo}: HTTP ${res.status} ${res.statusText}`);
    }
  } catch (e) {
    // Re-throw to be handled by caller
    throw e;
  }
}

export const AVAILABLE_MODELS: ModelInfo[] = [
  // Basic/General Tokenizers
  { id: 'Xenova/bert-base-multilingual-uncased', name: 'mBERT (Multilingual BERT)', shortName: 'mBERT', category: 'basic', implementation: 'transformers', family: 'WordPiece', vocabSize: null },
  { id: 'Xenova/t5-small', name: 'T5 (Text-to-Text Transformer)', shortName: 'T5', category: 'basic', implementation: 'transformers', family: 'SentencePiece', vocabSize: null },
  { id: 'Xenova/xlm-roberta-base', name: 'XLM-RoBERTa', shortName: 'XLM-R', category: 'basic', implementation: 'transformers', family: 'SentencePiece', vocabSize: null },
  { id: 'Xenova/bert-base-uncased', name: 'BERT (English)', shortName: 'BERT', category: 'basic', implementation: 'transformers', family: 'WordPiece', vocabSize: null },
  { id: 'Xenova/distilgpt2', name: 'DistilGPT-2', shortName: 'DistilGPT-2', category: 'basic', implementation: 'transformers', family: 'ByteBPE', vocabSize: null },

  // Indian Language Tokenizers
  { id: 'ai4bharat/IndicBERTv2-MLM-only', name: 'IndicBERT v2 MLM (AI4Bharat)', shortName: 'IndicBERT v2', category: 'indian', implementation: 'transformers', family: 'WordPiece', vocabSize: null },
  { id: 'InvincibleSloth/muril-tokenizer', name: 'MuRIL', shortName: 'MuRIL', category: 'indian', implementation: 'transformers', family: 'WordPiece', vocabSize: null },

  // Frontier Tokenizers (non-Transformers.js or cutting-edge models)
  { id: 'openai/tiktoken/cl100k_base', name: 'OpenAI GPT-4 Family (cl100k_base)', shortName: 'OpenAI CL100K', category: 'frontier', implementation: 'tiktoken', encoding: 'cl100k_base', family: 'Tiktoken', vocabSize: 100000 },
  { id: 'openai/tiktoken/o200k_base', name: 'OpenAI GPT-4o mini (o200k_base)', shortName: 'OpenAI O200K', category: 'frontier', implementation: 'tiktoken', encoding: 'o200k_base', family: 'Tiktoken', vocabSize: 200000 },
  { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Meta Llama 3.1 8B Instruct', shortName: 'Llama3.1-8B', category: 'frontier', implementation: 'transformers', family: 'SentencePiece', vocabSize: null },
  { id: 'mistralai/Mistral-7B-Instruct-v0.3', name: 'Mistral 7B Instruct v0.3', shortName: 'Mistral', category: 'frontier', implementation: 'transformers', family: 'SentencePiece', vocabSize: null }
];

interface TransformersTokenizerContext {
  modelName: string;
  hfToken?: string | null;
}

async function getTransformersTokenizer(
  repo: string,
  AutoTokenizer: any,
  context: TransformersTokenizerContext
): Promise<any> {
  const cached = transformersTokenizerCache.get(repo);
  if (cached) {
    return cached;
  }

  const loadPromise = (async () => {
    debugLog(`Loading tokenizer via Transformers.js: ${repo}`);
    try {
      const tok = await AutoTokenizer.from_pretrained(repo);
      debugLog(`Tokenizer loaded successfully: ${repo}`);
      return tok;
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);
      console.error(`Failed to load tokenizer ${repo}:`, errorMessage);

      if (/Unauthorized|401|403/.test(errorMessage)) {
        if (!context.hfToken) {
          throw new Error(
            `Access to ${context.modelName} requires a Hugging Face token. Paste a valid token in the "HF token" field (kept locally) and try again.`
          );
        }
        const snippet = context.hfToken.slice(0, 10);
        throw new Error(
          `Access to ${context.modelName} was denied. Your HF token (${snippet}...) may lack per-repository access. Visit https://huggingface.co/${repo} and click "Agree and Access" (must be the same account the token belongs to).`
        );
      }

      throw error;
    }
  })();

  loadPromise.catch(() => {
    transformersTokenizerCache.delete(repo);
  });

  transformersTokenizerCache.set(repo, loadPromise);
  return loadPromise;
}

async function ensureTransformersTokenizer(model: ModelInfo): Promise<any> {
  const repo = model.id;
  const hf = await waitForTransformers();
  const { AutoTokenizer, env } = hf;

  const hfToken = readStoredHfToken();
  debugLog(`Using HF token: ${hfToken ? hfToken.slice(0, 10) + '...' : 'none'}`);
  if (hfToken) {
    env.accessToken = hfToken;
    debugLog('Set Transformers.js environment access token');
  }

  if (isLikelyGatedRepo(repo) && !gatedRepoPreflightCache.has(repo)) {
    try {
      await preflightHFRepoAccess(repo, hfToken ?? undefined);
      gatedRepoPreflightCache.add(repo);
    } catch (e: any) {
      console.error(`Preflight access check failed for ${repo}:`, e?.message || e);
      throw e;
    }
  }

  return getTransformersTokenizer(repo, AutoTokenizer, { modelName: model.name, hfToken });
}

export interface TokenizerEncodeHandle {
  implementation: ModelImplementation;
  encode: (text: string) => unknown;
  preprocess?: (text: string) => string;
}

export async function getTokenizerEncodeHandle(repo: string): Promise<TokenizerEncodeHandle> {
  const model = AVAILABLE_MODELS.find((m) => m.id === repo);
  if (!model) {
    throw new Error(`Tokenizer ${repo} is not available in this lab.`);
  }

  const implementation = model.implementation ?? 'transformers';
  if (implementation === 'tiktoken') {
    if (!model.encoding) {
      throw new Error(`Model ${model.id} is missing a tiktoken encoding identifier.`);
    }
    const tokenizer = await getTiktokenEncoding(model.encoding);
    return {
      implementation,
      preprocess: (value: string) => value.normalize('NFC'),
      encode: (value: string) => tokenizer.encode(value, 'all')
    };
  }

  const tok = await ensureTransformersTokenizer(model);
  return {
    implementation,
    encode: (value: string) => tok.encode(value, undefined, { add_special_tokens: false } as any)
  };
}

export async function tokenizeForTiming(repo: string, text: string): Promise<void> {
  const model = AVAILABLE_MODELS.find((m) => m.id === repo);
  if (!model) {
    throw new Error(`Tokenizer ${repo} is not available in this lab.`);
  }

  const sanitized = sanitizeAndValidateInput(text);
  try {
    const handle = await getTokenizerEncodeHandle(repo);
    const prepared = handle.preprocess ? handle.preprocess(sanitized) : sanitized;
    const result = handle.encode(prepared);
    if (result && typeof (result as any).then === 'function') {
      await result;
    }
  } catch (error) {
    console.error(`Error timing tokenizer ${repo}:`, error);
    throw error;
  }
}

export async function tokenizeOnce(repo: string, text: string): Promise<TokenizationResult> {
  const model = AVAILABLE_MODELS.find((m) => m.id === repo);
  if (!model) {
    throw new Error(`Tokenizer ${repo} is not available in this lab.`);
  }

  const sanitized = sanitizeAndValidateInput(text);

  const implementation = model.implementation ?? 'transformers';
  if (implementation === 'tiktoken') {
    return tokenizeWithTiktokenModel(model, sanitized);
  }

  try {
    const tok = await ensureTransformersTokenizer(model);
    const resolvedVocabSize = await ensureModelVocabSize(model, tok);

    // Try to encode with offsets first, fallback to basic encoding
    let enc: any;
    try {
      enc = tok.encode(sanitized, undefined, { add_special_tokens: false, return_offsets_mapping: true } as any);
      debugLog(`Encoded with offsets:`, enc);
    } catch (error) {
      debugLog(`Offsets not supported, using basic encoding:`, error);
      enc = tok.encode(sanitized, undefined, { add_special_tokens: false } as any);
      debugLog(`Encoded without offsets:`, enc);
    }

    const ids = toIds(enc);
    const displayTokens = await displayTokensFor(tok, sanitized, ids, enc);
    let tokenStrings: string[] | undefined;
    try {
      if (typeof (tok as any).convert_ids_to_tokens === 'function') {
        tokenStrings = (tok as any).convert_ids_to_tokens(ids);
      }
    } catch (error) {
      debugLog('convert_ids_to_tokens not available/failed:', error);
    }
    if (!tokenStrings && Array.isArray((enc as any)?.tokens)) {
      tokenStrings = Array.from((enc as any).tokens);
    }
    const offsets = toOffsets(enc);

    const graphemeCount = countGraphemes(sanitized);
    const codePointCount = countCodePoints(sanitized);
    const byteCount = countUtf8Bytes(sanitized);
    const tokenCount = ids.length;
    const safeDivisor = Math.max(1, tokenCount);
    const { sum: tokenGraphemeSum, entropy: fragEntropy } = computeTokenLengthSummary(displayTokens);
    const avgTokenGraphemes = tokenGraphemeSum / safeDivisor;
    const tokensPer100Graphemes = graphemeCount > 0 ? (tokenCount / graphemeCount) * 100 : 0;
    const tokensPer100CodePoints = codePointCount > 0 ? (tokenCount / codePointCount) * 100 : 0;

    const family = model.family ?? 'Unspecified';
    const isByteFallbackFamily = family === 'ByteBPE' || family === 'Tiktoken';

    let unkCount = 0;
    let resolvedUnkIds: number[] = [];
    let unkSamples: { id: number; token: string }[] | undefined;

    if (!isByteFallbackFamily) {
      const specialIds = new Set<number>();
      const registerSpecialId = (value: unknown) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          specialIds.add(value);
        }
      };

      const allSpecialIds = (tok as any)?.all_special_ids;
      if (Array.isArray(allSpecialIds)) {
        allSpecialIds.forEach(registerSpecialId);
      }

      const specialTokenProps = ['bos_token_id', 'eos_token_id', 'cls_token_id', 'sep_token_id', 'pad_token_id', 'mask_token_id'] as const;
      for (const prop of specialTokenProps) {
        registerSpecialId((tok as any)?.[prop]);
      }

      const unkIds = new Set<number>();
      const registerUnkId = (value: unknown) => {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          unkIds.add(value);
        }
      };

      registerUnkId((tok as any)?.unk_token_id);

      if (typeof (tok as any)?.token_to_id === 'function') {
        const unkCandidates = new Set<string>([
          (tok as any)?.unk_token,
          '[UNK]',
          '<unk>',
          '<UNK>',
          '⁇'
        ].filter((value): value is string => typeof value === 'string' && value.length > 0));

        for (const candidate of unkCandidates) {
          try {
            const resolved = (tok as any).token_to_id(candidate);
            registerUnkId(resolved);
          } catch {
            // ignore lookup failures
          }
        }
      }

      if (tokenStrings && tokenStrings.length === ids.length) {
        const unkStringSet = new Set(['[UNK]', '<unk>', '<UNK>', '⁇']);
        for (let i = 0; i < tokenStrings.length; i += 1) {
          if (unkStringSet.has(tokenStrings[i])) {
            registerUnkId(ids[i]);
          }
        }
      }

      const effectiveUnkIds = Array.from(unkIds);
      if (effectiveUnkIds.length > 0) {
        resolvedUnkIds = effectiveUnkIds.sort((a, b) => a - b);
        const effectiveUnkIdSet = new Set(resolvedUnkIds);
        unkCount = ids.filter((id) => effectiveUnkIdSet.has(id)).length;

        if (unkCount > 0) {
          const samples: { id: number; token: string }[] = [];
          for (let i = 0; i < ids.length && samples.length < 10; i += 1) {
            if (effectiveUnkIdSet.has(ids[i])) {
              const tokenLabel = tokenStrings?.[i] ?? displayTokens[i] ?? String(ids[i]);
              samples.push({ id: ids[i], token: tokenLabel });
            }
          }
          if (samples.length) {
            unkSamples = samples;
          }
        }
      }
    }

    const unkPercentage = safeDivisor > 0 ? (unkCount / safeDivisor) * 100 : 0;

    if (unkCount > 0) {
      console.warn(
        `UNK detected in ${model.id}: ${unkCount} tokens (${unkPercentage.toFixed(2)}%) | IDs: ${resolvedUnkIds.join(', ')}`
      );
    }

    return {
      ids,
      tokens: displayTokens,
      tokenStrings,
      offsets: offsets.length === ids.length ? offsets : undefined,
      vocabSize: resolvedVocabSize,
      unkTokenSamples: unkSamples,
      metrics: {
        tokenCount,
        graphemeCount,
        charCount: graphemeCount,
        codePointCount,
        byteCount,
        tokensPer100Chars: tokensPer100Graphemes,
        tokensPer100Graphemes,
        tokensPer100CodePoints,
        bytesPerToken: byteCount / safeDivisor,
        avgTokenLength: avgTokenGraphemes,
        fragEntropy,
        unkCount,
        unkPercentage
      }
    };
  } catch (error) {
    console.error(`Error loading tokenizer ${repo}:`, error);
    throw error;
  }
}
