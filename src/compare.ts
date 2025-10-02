import { tokenizeOnce, AVAILABLE_MODELS, TIKTOKEN_VERSION, TRANSFORMERS_JS_VERSION, ANTHROPIC_TOKENIZER_VERSION, TIKTOKEN_WASM_URL } from './tokenizers'
import type { ModelInfo, TokenizationResult } from './tokenizers'

export const PINNED_COMPARISON_IDS = [
  'Xenova/bert-base-multilingual-uncased',
  'Xenova/xlm-roberta-base',
  'Xenova/distilgpt2',
  'Xenova/t5-small',
  'openai/tiktoken/cl100k_base',
  'openai/tiktoken/o200k_base'
] as const

export const COMPARISON_REPOS = [...PINNED_COMPARISON_IDS]

const MODEL_LOOKUP = new Map<string, ModelInfo>(AVAILABLE_MODELS.map((model) => [model.id, model]))

const BATCH_SETTINGS = { add_special_tokens: false, normalization: 'NFC' } as const
const APP_VERSION = import.meta.env?.VITE_APP_VERSION ?? 'dev'
const TIMED_RUN_COUNT = 5
const TIMED_OPERATION = 'encode'
const TIMING_VARIANCE_THRESHOLD = 0.25
const getNow =
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? () => performance.now()
    : () => Date.now()

const LIBRARY_VERSIONS = {
  transformers: `@xenova/transformers@${TRANSFORMERS_JS_VERSION}`,
  tiktoken: `@dqbd/tiktoken@${TIKTOKEN_VERSION}`,
  anthropic: `@anthropic-ai/tokenizer@${ANTHROPIC_TOKENIZER_VERSION}`
} as const

// Provenance information for reproducibility
export interface ProvenanceInfo {
  tokenizer_id: string
  tokenizer_display_name: string
  tokenizer_family: string | null
  tokenizer_vocab_size: number | null
  add_special_tokens: boolean
  normalization: string
  lib_version: string
  libraries: {
    transformers: string
    tiktoken: string
    anthropic: string
  }
  wasm_url: string | null
  wasm_hash: string | null
  app_version: string
  build_time: string
  commit_sha: string | null
  browser_ua: string
  os_platform: string
  timestamp_utc: string
  transformersjs_version: string | null
  tiktoken_version: string | null
  anthropic_tokenizer_version: string | null
  timing_runs_ms?: number[]
}

export function getProvenanceInfo(
  tokenizerRepo: string,
  options: {
    displayName?: string
    family?: string | null
    vocabSize?: number | null
    addSpecialTokens?: boolean
    normalization?: string
    timingRuns?: number[]
  } = {}
): ProvenanceInfo {
  const {
    displayName,
    family = null,
    vocabSize = null,
    addSpecialTokens = BATCH_SETTINGS.add_special_tokens,
    normalization = BATCH_SETTINGS.normalization,
    timingRuns
  } = options

  const now = new Date()
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Node.js'
  const platform = typeof navigator !== 'undefined' ? navigator.platform || 'Unknown' : 'Node.js'

  const usesTiktoken = tokenizerRepo.includes('tiktoken')
  const wasmUrl = usesTiktoken ? TIKTOKEN_WASM_URL : null
  const wasmHash = usesTiktoken ? deriveWasmHash(wasmUrl) : null
  const commitRaw = import.meta.env.VITE_GIT_COMMIT
  const commitSha = commitRaw && commitRaw !== 'unknown' ? commitRaw : null

  const provenance: ProvenanceInfo = {
    tokenizer_id: tokenizerRepo,
    tokenizer_display_name: displayName ?? getDisplayName(tokenizerRepo),
    tokenizer_family: family,
    tokenizer_vocab_size: typeof vocabSize === 'number' ? vocabSize : null,
    add_special_tokens: addSpecialTokens,
    normalization,
    lib_version: getLibraryVersion(tokenizerRepo),
    libraries: {
      transformers: LIBRARY_VERSIONS.transformers,
      tiktoken: LIBRARY_VERSIONS.tiktoken,
      anthropic: LIBRARY_VERSIONS.anthropic
    },
    wasm_url: wasmUrl,
    wasm_hash: wasmHash,
    app_version: APP_VERSION,
    build_time: import.meta.env.VITE_BUILD_TIME || now.toISOString(),
    commit_sha: commitSha,
    browser_ua: userAgent,
    os_platform: platform,
    timestamp_utc: now.toISOString(),
    transformersjs_version: TRANSFORMERS_JS_VERSION,
    tiktoken_version: usesTiktoken ? TIKTOKEN_VERSION : null,
    anthropic_tokenizer_version: ANTHROPIC_TOKENIZER_VERSION,
    ...(timingRuns && timingRuns.length
      ? { timing_runs_ms: timingRuns.map((value) => Number(value.toFixed(3))) }
      : {})
  }

  return provenance
}

function getDisplayName(repo: string): string {
  const model = MODEL_LOOKUP.get(repo)
  return model?.shortName ?? model?.name ?? repo
}

function getLibraryVersion(tokenizerRepo: string): string {
  if (tokenizerRepo.includes('tiktoken')) {
    return LIBRARY_VERSIONS.tiktoken
  }
  if (tokenizerRepo.includes('anthropic')) {
    return LIBRARY_VERSIONS.anthropic
  }
  return LIBRARY_VERSIONS.transformers
}

function deriveWasmHash(url: string | null): string | null {
  if (!url) return null
  const sanitized = url.split('?')[0]
  const filename = sanitized.split('/').pop()
  if (!filename) return null
  const withoutExt = filename.includes('.') ? filename.slice(0, filename.lastIndexOf('.')) : filename
  const dashIndex = withoutExt.lastIndexOf('-')
  if (dashIndex > 0) {
    return withoutExt.slice(dashIndex + 1)
  }
  return withoutExt
}

export async function compareAll(text: string, repos: string[] = COMPARISON_REPOS) {
  const jobs = repos.map(async (repo) => {
    const result = await tokenizeOnce(repo, text)
    return { repo, display_name: getDisplayName(repo), ...result }
  })

  return Promise.all(jobs)
}

export interface BatchCsvRow {
  slice: Slice
  lang_tag: string
  text: string
  ascii_ratio_bytes: number
  grapheme_count: number
  codepoint_count: number
  byte_count: number
  tokenizer_id: string
  tokenizer_family: string | null
  tokenizer_vocab_size: number | null
  add_special_tokens: boolean
  token_count: number
  tokens_per_100_chars: number
  tokens_per_100_codepoints: number
  bytes_per_token: number
  avg_token_len_graphemes: number
  unk_count: number
  unk_percent: number
  time_ms_median: number
  time_ms_mad: number
  repeats: number
  timed_op: string
  token_ids_json: string
  pieces_json: string
  normalization: string
  browser_ua: string
  os_platform: string
  app_version: string
  transformersjs_version: string | null
  tiktoken_version: string | null
  wasm_hash: string | null
  commit_sha: string | null
  timestamp_utc: string
  provenance_json: string
}

export type Row = BatchCsvRow & {
  tokenizer_display_name: string
}

export const BATCH_CSV_COLUMNS: (keyof BatchCsvRow)[] = [
  'slice',
  'lang_tag',
  'text',
  'ascii_ratio_bytes',
  'grapheme_count',
  'codepoint_count',
  'byte_count',
  'tokenizer_id',
  'tokenizer_family',
  'tokenizer_vocab_size',
  'add_special_tokens',
  'token_count',
  'tokens_per_100_chars',
  'tokens_per_100_codepoints',
  'bytes_per_token',
  'avg_token_len_graphemes',
  'unk_count',
  'unk_percent',
  'time_ms_median',
  'time_ms_mad',
  'repeats',
  'timed_op',
  'token_ids_json',
  'pieces_json',
  'normalization',
  'browser_ua',
  'os_platform',
  'app_version',
  'transformersjs_version',
  'tiktoken_version',
  'wasm_hash',
  'commit_sha',
  'timestamp_utc',
  'provenance_json'
]

export interface BatchRunOptions {
  slice?: Slice
}

export async function runBatch(
  repos: string[],
  lines: string[],
  options: BatchRunOptions = {}
): Promise<Row[]> {
  const rows: Row[] = []
  const { slice: sliceOverride } = options

  for (const repo of repos) {
    const model = MODEL_LOOKUP.get(repo)
    const displayName = getDisplayName(repo)
    const tokenizerFamily = model?.family ?? null
    let tokenizerVocabSize = typeof model?.vocabSize === 'number' ? model.vocabSize : null
    for (const text of lines) {
      const timingRuns: number[] = []
      let lastResult: TokenizationResult = await tokenizeOnce(repo, text)

      for (let runIndex = 0; runIndex < TIMED_RUN_COUNT; runIndex += 1) {
        const start = getNow()
        const measurement = await tokenizeOnce(repo, text)
        const duration = getNow() - start
        timingRuns.push(duration)
        lastResult = measurement
      }

      const medianRaw = median(timingRuns)
      const madRaw = medianAbsoluteDeviation(timingRuns, medianRaw)
      const timingRunsRounded = timingRuns.map((value) => Number(value.toFixed(3)))
      const includeRuns = shouldCaptureTimingRuns(timingRunsRounded, medianRaw)
      const medianRounded = Number.isFinite(medianRaw) ? Number(medianRaw.toFixed(3)) : 0
      const madRounded = Number.isFinite(madRaw) ? Number(madRaw.toFixed(3)) : 0

      const resultVocabSize = typeof lastResult.vocabSize === 'number' && Number.isFinite(lastResult.vocabSize)
        ? lastResult.vocabSize
        : null
      const effectiveVocabSize = resultVocabSize ?? tokenizerVocabSize
      if (model && typeof effectiveVocabSize === 'number' && Number.isFinite(effectiveVocabSize)) {
        model.vocabSize = effectiveVocabSize
        tokenizerVocabSize = effectiveVocabSize
        MODEL_LOOKUP.set(repo, model)
      }

      const rowSlice = sliceOverride ?? tagSlice(text)
      const langTag = inferLanguageTag(rowSlice, text)
      const tokenCount = lastResult.metrics.tokenCount
      const graphemeCount = lastResult.metrics.graphemeCount ?? lastResult.metrics.charCount
      const codepointCount = lastResult.metrics.codePointCount ?? graphemeCount
      const byteCount = lastResult.metrics.byteCount
      const asciiRatio = Number(computeAsciiByteRatio(text, byteCount).toFixed(6))
      const tokensPer100 = lastResult.metrics.tokensPer100Graphemes ?? lastResult.metrics.tokensPer100Chars
      const tokensPer100Codepoints = lastResult.metrics.tokensPer100CodePoints ?? (codepointCount > 0 ? (tokenCount / codepointCount) * 100 : 0)
      const avgTokenLen = lastResult.metrics.avgTokenLength ?? (tokenCount > 0 ? graphemeCount / tokenCount : 0)

      const unkPercentage = lastResult.metrics.unkPercentage ?? 0
      const derivedUnkCount = (
        typeof lastResult.metrics.unkCount === 'number'
          ? lastResult.metrics.unkCount
          : Math.round((unkPercentage / 100) * tokenCount)
      )
      const unkCount = Number.isFinite(derivedUnkCount) ? derivedUnkCount : 0
      const unkPercent = tokenCount > 0 ? (unkCount / tokenCount) * 100 : 0

      const tokenIdsJson = JSON.stringify(lastResult.ids ?? [])
      const piecesSource = lastResult.tokenStrings?.length ? lastResult.tokenStrings : lastResult.tokens
      const piecesJson = JSON.stringify(piecesSource ?? [])

      const provenance = getProvenanceInfo(repo, {
        displayName,
        family: tokenizerFamily,
  vocabSize: tokenizerVocabSize,
        addSpecialTokens: BATCH_SETTINGS.add_special_tokens,
        normalization: BATCH_SETTINGS.normalization,
        timingRuns: includeRuns ? timingRunsRounded : undefined
      })

      rows.push({
        slice: rowSlice,
        lang_tag: langTag,
        text,
        ascii_ratio_bytes: asciiRatio,
        grapheme_count: graphemeCount,
        codepoint_count: codepointCount,
        byte_count: byteCount,
        tokenizer_id: repo,
        tokenizer_family: tokenizerFamily,
  tokenizer_vocab_size: tokenizerVocabSize,
        add_special_tokens: BATCH_SETTINGS.add_special_tokens,
        token_count: tokenCount,
        tokens_per_100_chars: Number(tokensPer100.toFixed(6)),
  tokens_per_100_codepoints: Number(tokensPer100Codepoints.toFixed(6)),
        bytes_per_token: Number(lastResult.metrics.bytesPerToken.toFixed(6)),
        avg_token_len_graphemes: Number(avgTokenLen.toFixed(6)),
        unk_count: unkCount,
        unk_percent: Number(unkPercent.toFixed(6)),
        time_ms_median: medianRounded,
        time_ms_mad: madRounded,
        repeats: TIMED_RUN_COUNT,
        timed_op: TIMED_OPERATION,
        token_ids_json: tokenIdsJson,
        pieces_json: piecesJson,
        normalization: BATCH_SETTINGS.normalization,
        browser_ua: provenance.browser_ua,
        os_platform: provenance.os_platform,
        app_version: provenance.app_version,
        transformersjs_version: provenance.transformersjs_version,
        tiktoken_version: provenance.tiktoken_version,
        wasm_hash: provenance.wasm_hash,
        commit_sha: provenance.commit_sha,
        timestamp_utc: provenance.timestamp_utc,
        provenance_json: JSON.stringify(provenance),
        tokenizer_display_name: displayName
      })
    }
  }

  return rows
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2
  }
  return sorted[middle]
}

function shouldCaptureTimingRuns(runs: number[], medianValue: number): boolean {
  if (runs.length <= 1) return false
  const min = Math.min(...runs)
  const max = Math.max(...runs)
  const range = max - min
  if (medianValue === 0) {
    return range > 0
  }
  return range / medianValue >= TIMING_VARIANCE_THRESHOLD
}

export function toCSV(rows: Row[]) {
  if (!rows.length) return ''
  const esc = (v: any) => /["\n,]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  return [
    BATCH_CSV_COLUMNS.join(','),
    ...rows.map((row) => {
      const csvRow: BatchCsvRow = row
      return BATCH_CSV_COLUMNS.map((key) => esc(csvRow[key])).join(',')
    })
  ].join('\n')
}

export function summaryToCSV(summary: SummaryRow[]) {
  if (!summary.length) return ''
  const cols = Object.keys(summary[0]) as (keyof SummaryRow)[]
  const esc = (v: any) => /["\n,]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  return [cols.join(','), ...summary.map(r => cols.map(k => esc(r[k])).join(','))].join('\n')
}

export function downloadCSV(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export type Slice = 'Hindi' | 'Hinglish' | 'Kannada' | 'English' | 'Mixed' | 'Tamil'

const SLICE_TO_LANG_TAG: Record<Slice, string> = {
  Hindi: 'hi-Deva',
  Hinglish: 'hi-Latn',
  Kannada: 'kn-Knda',
  English: 'en-Latn',
  Mixed: 'mix',
  Tamil: 'ta-Taml'
}

export function tagSlice(text: string): Slice {
  const hasTamil = /[\u0B80-\u0BFF]/.test(text)
  const hasKannada = /[\u0C80-\u0CFF]/.test(text)
  const hasDevanagari = /[\u0900-\u097F]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  const hasUrlOrSymbol = /https?:|[@:#-]/.test(text)
  const hasEmojiLike = /[\u2600-\u27BF\u1F300-\u1FAFF]/.test(text)

  if (hasTamil) return 'Tamil'
  if (hasKannada) return 'Kannada'
  if (hasDevanagari && hasLatin) return 'Hinglish'
  if (hasDevanagari) return 'Hindi'
  if (hasLatin && (hasEmojiLike || hasUrlOrSymbol)) return 'Mixed'
  if (hasLatin) return 'English'
  if (hasEmojiLike || hasUrlOrSymbol) return 'Mixed'
  return 'Mixed'
}

export function inferLanguageTag(slice: Slice, text: string): string {
  if (slice !== 'Mixed') {
    return SLICE_TO_LANG_TAG[slice] ?? 'und'
  }

  const hasDevanagari = /[\u0900-\u097F]/.test(text)
  const hasKannada = /[\u0C80-\u0CFF]/.test(text)
  const hasTamil = /[\u0B80-\u0BFF]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)

  if (hasDevanagari && hasLatin) return 'hi-Latn'
  if (hasKannada) return 'kn-Knda'
  if (hasTamil) return 'ta-Taml'
  if (hasDevanagari) return 'hi-Deva'
  if (hasLatin) return 'en-Latn'
  return 'mix'
}

export type SummaryRow = {
  tokenizer_id: string
  tokenizer_display_name: string
  slice: Slice
  mean_tokens: number
  mean_tokens_per_100: number
  mean_bytes_per_token: number
  mean_unk: number
  stddev_tokens: number
  stddev_tokens_per_100: number
  stddev_bytes_per_token: number
  stddev_unk: number
  ci_tokens_lower: number
  ci_tokens_upper: number
  ci_tokens_per_100_lower: number
  ci_tokens_per_100_upper: number
  ci_bytes_per_token_lower: number
  ci_bytes_per_token_upper: number
  ci_unk_lower: number
  ci_unk_upper: number
  sample_count: number
}

// Statistical helper functions
function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

function medianAbsoluteDeviation(values: number[], medianValue?: number): number {
  if (!values.length) return 0
  const baseline = typeof medianValue === 'number' ? medianValue : median(values)
  const deviations = values.map((value) => Math.abs(value - baseline))
  return median(deviations)
}

function computeAsciiByteRatio(text: string, totalBytes: number): number {
  if (!text) return 0
  if (typeof TextEncoder === 'undefined') return 0
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  const length = bytes.length || totalBytes
  if (!length) return 0
  const asciiCount = bytes.reduce((count, byte) => (byte <= 0x7f ? count + 1 : count), 0)
  return asciiCount / (length || 1)
}

function standardDeviation(values: number[]): number {
  if (values.length <= 1) return 0
  const m = mean(values)
  const variance = values.reduce((acc, val) => acc + Math.pow(val - m, 2), 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// Bootstrap confidence interval (95% CI using percentile method)
function bootstrapCI(values: number[], iterations = 1000, confidence = 0.95): [number, number] {
  if (values.length <= 1) return [0, 0]
  
  const bootstrapMeans: number[] = []
  const n = values.length
  
  for (let i = 0; i < iterations; i++) {
    const sample: number[] = []
    for (let j = 0; j < n; j++) {
      const randomIndex = Math.floor(Math.random() * n)
      sample.push(values[randomIndex])
    }
    bootstrapMeans.push(mean(sample))
  }
  
  bootstrapMeans.sort((a, b) => a - b)
  const alpha = 1 - confidence
  const lowerIndex = Math.floor(alpha / 2 * iterations)
  const upperIndex = Math.floor((1 - alpha / 2) * iterations) - 1
  
  return [
    bootstrapMeans[lowerIndex] || 0,
    bootstrapMeans[upperIndex] || 0
  ]
}

export function summarize(rows: Row[]): SummaryRow[] {
  const grouped = new Map<string, Row[]>()

  for (const row of rows) {
    const bucketKey = `${row.tokenizer_id}|${row.slice}`
    const bucket = grouped.get(bucketKey) ?? []
    bucket.push(row)
    grouped.set(bucketKey, bucket)
  }

  return Array.from(grouped.values()).map((bucketRows) => {
    const sample = bucketRows[0]
    const tokenCounts = bucketRows.map((r) => r.token_count)
    const tokensPer100 = bucketRows.map((r) => r.tokens_per_100_chars)
    const bytesPerToken = bucketRows.map((r) => r.bytes_per_token)
    const unkRates = bucketRows.map((r) => r.unk_percent / 100)

    const meanTokens = mean(tokenCounts)
    const meanTokensPer100 = mean(tokensPer100)
    const meanBytesPerToken = mean(bytesPerToken)
    const meanUnk = mean(unkRates)

    const stddevTokens = standardDeviation(tokenCounts)
    const stddevTokensPer100 = standardDeviation(tokensPer100)
    const stddevBytesPerToken = standardDeviation(bytesPerToken)
    const stddevUnk = standardDeviation(unkRates)

    const [ciTokensLower, ciTokensUpper] = bootstrapCI(tokenCounts)
    const [ciTokensPer100Lower, ciTokensPer100Upper] = bootstrapCI(tokensPer100)
    const [ciBytesPerTokenLower, ciBytesPerTokenUpper] = bootstrapCI(bytesPerToken)
    const [ciUnkLower, ciUnkUpper] = bootstrapCI(unkRates)

    return {
      tokenizer_id: sample.tokenizer_id,
      tokenizer_display_name: sample.tokenizer_display_name,
      slice: sample.slice,
      mean_tokens: meanTokens,
      mean_tokens_per_100: meanTokensPer100,
      mean_bytes_per_token: meanBytesPerToken,
      mean_unk: meanUnk,
      stddev_tokens: stddevTokens,
      stddev_tokens_per_100: stddevTokensPer100,
      stddev_bytes_per_token: stddevBytesPerToken,
      stddev_unk: stddevUnk,
      ci_tokens_lower: ciTokensLower,
      ci_tokens_upper: ciTokensUpper,
      ci_tokens_per_100_lower: ciTokensPer100Lower,
      ci_tokens_per_100_upper: ciTokensPer100Upper,
      ci_bytes_per_token_lower: ciBytesPerTokenLower,
      ci_bytes_per_token_upper: ciBytesPerTokenUpper,
      ci_unk_lower: ciUnkLower,
      ci_unk_upper: ciUnkUpper,
      sample_count: bucketRows.length
    }
  })
}

// Starter dataset
export const STARTER_DATASET = `आज धूप नहीं निकली है।
कल स्कूल की छुट्टी है।
यह कीमत ₹1200 है।
aaj dhoop nahi nikli hai
kal school ki chhutti hai
yeh keemat 1200 rupaye hai
ಇಂದು ಬಿಸಿಲು ಕಾಣಿಸಲಿಲ್ಲ.
ನಾಳೆ ಶಾಲೆಗೆ ರಜೆ ಇದೆ.
ದರ ₹750.
The sun did not rise today.
Traffic in Bengaluru is wild.
Price is ₹499 only.
Bangalore ka traffic 😂
aaj 10:30 AM @ https://example.com
नमस्ते 🙏🏻`
