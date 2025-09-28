import { init as initTiktoken, Tiktoken } from '@dqbd/tiktoken/lite/init';
import wasmUrl from '@dqbd/tiktoken/lite/tiktoken_bg.wasm?url';
import claudeRegistry from '@anthropic-ai/tokenizer/claude.json' assert { type: 'json' };

export const TIKTOKEN_VERSION = '1.0.22';
export const TRANSFORMERS_JS_VERSION = '2.17.2';
export const ANTHROPIC_TOKENIZER_VERSION = '0.0.4';

export const TIKTOKEN_WASM_URL = wasmUrl;

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
// 2. Otherwise, use the hardcoded test token.
export function readStoredHfToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.localStorage?.getItem('hf_token');
    const trimmed = value?.trim();
    return trimmed || undefined;
  } catch (error) {
    console.warn('Unable to access localStorage for HF token:', error);
    return undefined;
  }
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
  const normalized = text.normalize('NFKC');
  const encoded = tokenizer.encode(normalized, 'all');
  const ids = Array.from(encoded);

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

  const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;
  const graphemes = segmenter
    ? [...segmenter.segment(normalized)].length
    : [...normalized].length;
  const byteCount = new TextEncoder().encode(normalized).length;
  const tokenCount = ids.length;
  const safeDivisor = Math.max(1, tokenCount);
  const avgTokenChars = displayTokens.reduce((sum, token) => {
    const cleanTok = String(token || '').replace(/[␣⇥⏎]/g, ' ');
    return sum + [...cleanTok].length;
  }, 0) / safeDivisor;

  return {
    ids,
    tokens: displayTokens,
    tokenStrings: rawPieces,
    offsets: offsets.length === ids.length ? offsets : undefined,
    metrics: {
      tokenCount,
      charCount: graphemes,
      byteCount,
      tokensPer100Chars: (tokenCount / Math.max(1, graphemes)) * 100,
      bytesPerToken: byteCount / safeDivisor,
      avgTokenLength: avgTokenChars,
      unkCount: 0,
      unkPercentage: 0
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
  return new Promise((resolve, reject) => {
    if ((window as any).hf) {
      resolve((window as any).hf);
      return;
    }

    let attempts = 0;
    const checkInterval = setInterval(() => {
      attempts++;
      if ((window as any).hf) {
        clearInterval(checkInterval);
        resolve((window as any).hf);
      } else if (attempts > 100) { // 10 seconds timeout
        clearInterval(checkInterval);
        reject(new Error('Transformers.js failed to load'));
      }
    }, 100);
  });
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
  metrics: {
    tokenCount: number;
    charCount: number;
    byteCount: number;
    tokensPer100Chars: number;
    bytesPerToken: number;
    avgTokenLength: number;
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
    const res = await fetch(url, { method: 'HEAD' });
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

export async function tokenizeOnce(repo: string, text: string): Promise<TokenizationResult> {
  const model = AVAILABLE_MODELS.find((m) => m.id === repo);
  if (!model) {
    throw new Error(`Tokenizer ${repo} is not available in this lab.`);
  }

  const rawText = String(text ?? '');
  const sanitized = rawText.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
  if (!sanitized.trim()) {
    throw new Error('Empty text provided');
  }

  const implementation = model.implementation ?? 'transformers';
  if (implementation === 'tiktoken') {
    return tokenizeWithTiktokenModel(model, sanitized);
  }

  try {
    const hf = await waitForTransformers();
    const { AutoTokenizer, env } = hf;

    console.log(`Loading tokenizer via Transformers.js: ${repo}`);

    const hfToken = readStoredHfToken();
    console.log(`Using HF token: ${hfToken ? hfToken.slice(0, 10) + '...' : 'none'}`);
    
    // Set the token globally on Transformers.js environment
    if (hfToken) {
      env.accessToken = hfToken;
      console.log('Set Transformers.js environment access token');
    }

    // For likely gated repos, run a preflight access check for clearer errors
    if (isLikelyGatedRepo(repo)) {
      try {
        await preflightHFRepoAccess(repo, hfToken);
      } catch (e: any) {
        console.error(`Preflight access check failed for ${repo}:`, e?.message || e);
        throw e;
      }
    }

    let tok: any;
    try {
      tok = await AutoTokenizer.from_pretrained(repo);
    } catch (error: any) {
      const errorMessage = error?.message ?? String(error);
      console.error(`Failed to load tokenizer ${repo}:`, errorMessage);
      
      if (/Unauthorized|401|403/.test(errorMessage)) {
        if (!hfToken) {
          throw new Error(`Access to ${model.name} requires a Hugging Face token. Paste a valid token in the "HF token" field (kept locally) and try again.`);
        } else {
          throw new Error(`Access to ${model.name} was denied. Your HF token (${hfToken.slice(0, 10)}...) may lack per-repository access. Visit https://huggingface.co/${repo} and click "Agree and Access" (must be the same account the token belongs to).`);
        }
      }
      throw error;
    }
    console.log(`Tokenizer loaded successfully: ${repo}`);

    // Try to encode with offsets first, fallback to basic encoding
    let enc: any;
    try {
      enc = tok.encode(sanitized, undefined, { add_special_tokens: false, return_offsets_mapping: true } as any);
      console.log(`Encoded with offsets:`, enc);
    } catch (error) {
      console.log(`Offsets not supported, using basic encoding:`, error);
      enc = tok.encode(sanitized, undefined, { add_special_tokens: false } as any);
      console.log(`Encoded without offsets:`, enc);
    }

    const ids = toIds(enc);
    const displayTokens = await displayTokensFor(tok, sanitized, ids, enc);
    let tokenStrings: string[] | undefined = undefined;
    try {
      if (typeof (tok as any).convert_ids_to_tokens === 'function') {
        tokenStrings = (tok as any).convert_ids_to_tokens(ids);
      }
    } catch (e) {
      console.log('convert_ids_to_tokens not available/failed:', e);
    }
    if (!tokenStrings && Array.isArray((enc as any)?.tokens)) {
      tokenStrings = Array.from((enc as any).tokens);
    }
    const offsets = toOffsets(enc);

    const segmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl
      ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
      : null;
    const graphemes = segmenter
      ? [...segmenter.segment(sanitized)].length
      : [...sanitized].length;
    const bytes = new TextEncoder().encode(sanitized).length;
    const t = Math.max(1, ids.length);
    const avgTokenChars = displayTokens.reduce((s, tok) => {
      const cleanTok = String(tok || '').replace(/[␣⇥⏎]/g, ' ');
      return s + [...cleanTok].length;
    }, 0) / t;

    // Calculate UNK percentage - check both tokenStrings and displayTokens
    let unkCount = 0;
    if (tokenStrings) {
      console.log('TokenStrings for UNK check:', tokenStrings);
      unkCount = tokenStrings.filter(token => 
        token === '[UNK]' || token === '<unk>' || token === '�' || token.includes('[UNK]')
      ).length;
    }
    // Also check displayTokens for UNK patterns as fallback (including decoding failures)
    if (unkCount === 0) {
      console.log('DisplayTokens for UNK check:', displayTokens);
      unkCount = displayTokens.filter(token => 
        token.includes('[UNK]') || token === '[UNK]' || token === '<unk>' || 
        token === '�' || token.includes('<UNK>') || token === '⍰'
      ).length;
    }
    console.log(`UNK count: ${unkCount} out of ${ids.length} tokens`);
    const unkPercentage = ids.length > 0 ? (unkCount / ids.length) * 100 : 0;

    return {
      ids,
      tokens: displayTokens,
      tokenStrings,
      offsets: offsets.length === ids.length ? offsets : undefined,
      metrics: {
        tokenCount: ids.length,
        charCount: graphemes,
        byteCount: bytes,
        tokensPer100Chars: (ids.length / Math.max(1, graphemes)) * 100,
        bytesPerToken: bytes / t,
        avgTokenLength: avgTokenChars,
        unkCount,
        unkPercentage
      }
    };
  } catch (error) {
    console.error(`Error loading tokenizer ${repo}:`, error);
    throw error;
  }
}
