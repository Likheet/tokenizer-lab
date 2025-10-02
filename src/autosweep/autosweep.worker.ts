import {
  tokenizeOnce,
  tokenizeForTiming,
  AVAILABLE_MODELS,
  getTokenizerEncodeHandle,
  sanitizeAndValidateInput
} from '../tokenizers'
import { tagSlice, inferLanguageTag, getProvenanceInfo, type Slice } from '../compare'
import { AUTOSWEEP_PRESETS, DEFAULT_BASELINE_SETTINGS } from './presets'
import { mutateLine } from './mutations'
import { SeededRng, hashSeed } from './rng'
import type {
  AutoSweepJobConfig,
  AutoSweepWorkerMessage,
  AutoSweepCsvRow,
  SweepAxis,
  AutoSweepMutationSettings,
  AutoSweepProgressMessage,
  AutoSweepDoneMessage,
  AxisSampleLines,
  AutoSweepRowContext
} from './types'
import type { TokenizationResult } from '../tokenizers'

/// <reference lib="webworker" />

type WorkerRequest = { type: 'start'; payload: AutoSweepJobConfig }

const DEFAULT_FLUSH_EVERY = 200

const warmedTokenizers = new Set<string>()
const DEBUG_SAMPLES_PER_COMBO = 3
const DEBUG_TOKEN_CAPTURE_LIMIT = 64

function cloneBaseline(): AutoSweepMutationSettings {
  return { ...DEFAULT_BASELINE_SETTINGS }
}

function mergeSettings(
  baseline: AutoSweepMutationSettings,
  axis: SweepAxis,
  value: number | string
): AutoSweepMutationSettings {
  const next = { ...baseline }
  switch (axis) {
    case 'ascii_ratio':
      next.ascii_ratio = Number(value)
      break
    case 'emoji_count':
      next.emoji_count = Number(value)
      break
    case 'url_on':
      next.url_on = Number(value) ? 1 : 0
      break
    case 'normalize':
      next.normalize = String(value)
      break
    case 'zwj_on':
      next.zwj_on = Number(value) ? 1 : 0
      break
    case 'perturbations':
      next.perturbations = Number(value)
      break
    default:
      break
  }
  return next
}

function shouldCaptureTimingRuns(runs: number[], medianValue: number): boolean {
  if (runs.length <= 1) return false
  const min = Math.min(...runs)
  const max = Math.max(...runs)
  const range = max - min
  if (medianValue === 0) {
    return range > 0
  }
  return range / medianValue >= 0.25
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

function medianAbsoluteDeviation(values: number[], medianValue: number): number {
  if (!values.length) return 0
  const deviations = values.map((value) => Math.abs(value - medianValue))
  return median(deviations)
}

function shuffleInPlace<T>(items: T[], rng: SeededRng): void {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1)
    ;[items[i], items[j]] = [items[j], items[i]]
  }
}

function sampleLines(
  lines: string[],
  sampleCount: number,
  rng: SeededRng
): { index: number; text: string }[] {
  const filtered: { index: number; text: string; slice: Slice }[] = []
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.length) {
      const slice = tagSlice(trimmed)
      filtered.push({ index, text: trimmed, slice })
    }
  })

  if (filtered.length <= sampleCount) {
    return filtered.map(({ index, text }) => ({ index, text }))
  }

  const groups = new Map<Slice, { index: number; text: string }[]>()
  for (const entry of filtered) {
    if (!groups.has(entry.slice)) {
      groups.set(entry.slice, [])
    }
    groups.get(entry.slice)!.push({ index: entry.index, text: entry.text })
  }

  const sliceEntries = Array.from(groups.entries())
  shuffleInPlace(sliceEntries, rng)

  const sliceCount = sliceEntries.length || 1
  const basePerSlice = Math.floor(sampleCount / sliceCount)
  let remainder = sampleCount - basePerSlice * sliceCount
  const result: { index: number; text: string }[] = []

  for (const [slice, items] of sliceEntries) {
    const pool = [...items]
    shuffleInPlace(pool, rng)
    const allowance = basePerSlice + (remainder > 0 ? 1 : 0)
    const take = Math.min(pool.length, Math.max(allowance, 0))
    if (remainder > 0) {
      remainder -= 1
    }
    result.push(...pool.slice(0, take))
    groups.set(slice, pool.slice(take))
  }

  if (result.length < sampleCount) {
    const leftovers = Array.from(groups.values()).flat()
    shuffleInPlace(leftovers, rng)
    const needed = sampleCount - result.length
    result.push(...leftovers.slice(0, needed))
  }

  return result.slice(0, sampleCount)
}

function normalizeConfigSweeps(sweeps: AutoSweepJobConfig['sweeps']): Required<AutoSweepJobConfig['sweeps']> {
  return {
    ascii_ratio: sweeps.ascii_ratio?.slice() ?? [],
    emoji_count: sweeps.emoji_count?.slice() ?? [],
    url_on: sweeps.url_on?.slice() ?? [],
    normalize: sweeps.normalize?.slice() ?? [],
    zwj_on: sweeps.zwj_on?.slice() ?? [],
    perturbations: sweeps.perturbations?.slice() ?? []
  }
}

function normalizeAxisSampleLines(map?: AxisSampleLines): AxisSampleLines {
  if (!map) return {}
  const result: AxisSampleLines = {}
  for (const [rawAxis, rawValue] of Object.entries(map)) {
    const axis = rawAxis as SweepAxis
    const value = Number(rawValue)
    if (Number.isFinite(value) && value > 0) {
      result[axis] = Math.max(1, Math.floor(value))
    }
  }
  return result
}

function measureAsciiBytes(text: string): { asciiBytes: number; totalBytes: number; ratio: number } {
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  if (!bytes.length) {
    return { asciiBytes: 0, totalBytes: 0, ratio: 0 }
  }
  let asciiBytes = 0
  for (const byte of bytes) {
    if (byte <= 0x7f) {
      asciiBytes += 1
    }
  }
  return { asciiBytes, totalBytes: bytes.length, ratio: asciiBytes / bytes.length }
}

function isBaselineClean(mutated: ReturnType<typeof mutateLine>): boolean {
  return (
    mutated.normalization === 'NFC' &&
    mutated.zwjApplied === 0 &&
    mutated.urlApplied === 0 &&
    mutated.emojiCount === 0 &&
    mutated.perturbations === 0
  )
}

function hasLatinAndDevanagari(text: string): boolean {
  const hasLatin = /[A-Za-z]/.test(text)
  const hasDevanagari = /[\u0900-\u097F]/.test(text)
  return hasLatin && hasDevanagari
}

function createSweepPlan(
  sweeps: Required<AutoSweepJobConfig['sweeps']>,
  enabledAxes: SweepAxis[]
): { axis: SweepAxis; values: (number | string)[] }[] {
  const axisOrder: SweepAxis[] = ['ascii_ratio', 'emoji_count', 'url_on', 'normalize', 'zwj_on', 'perturbations']
  const enabledSet = new Set(enabledAxes)
  return axisOrder
    .filter((axis) => enabledSet.has(axis) && sweeps[axis]?.length)
    .map((axis) => ({ axis, values: sweeps[axis] ?? [] }))
}

function formatAxisValue(axis: SweepAxis, value: number | string): number | string {
  if (axis === 'ascii_ratio' || axis === 'emoji_count' || axis === 'perturbations') {
    const numeric = typeof value === 'number' ? value : Number(value)
    return Number.isFinite(numeric) ? numeric : value
  }
  return String(value)
}

function resolvePresetConfig(config: AutoSweepJobConfig) {
  if (config.preset === 'custom') {
    return {
      sampleLines: config.sampleLines ?? config.lines.length,
      repeats: config.repeats,
      sweeps: normalizeConfigSweeps(config.sweeps),
      axisSampleLines: normalizeAxisSampleLines(config.axisSampleLines)
    }
  }
  const preset = AUTOSWEEP_PRESETS[config.preset]
  const combinedAxisSampleLines = {
    ...(preset.axisSampleLines ?? {}),
    ...(config.axisSampleLines ?? {})
  }
  return {
    sampleLines: config.sampleLines ?? preset.sampleLines,
    repeats: config.repeats ?? preset.repeats,
    sweeps: normalizeConfigSweeps({
      ascii_ratio: config.sweeps.ascii_ratio ?? preset.sweeps.ascii_ratio,
      emoji_count: config.sweeps.emoji_count ?? preset.sweeps.emoji_count,
      url_on: config.sweeps.url_on ?? preset.sweeps.url_on,
      normalize: config.sweeps.normalize ?? preset.sweeps.normalize,
      zwj_on: config.sweeps.zwj_on ?? preset.sweeps.zwj_on,
      perturbations: config.sweeps.perturbations ?? preset.sweeps.perturbations
    }),
    axisSampleLines: normalizeAxisSampleLines(combinedAxisSampleLines)
  }
}

function buildProvenancePayload(
  provenance: any,
  runtimeConfig: {
    preset: 'fast' | 'full' | 'custom'
    sampleLines: number
    repeats: number
    sweeps: Required<AutoSweepJobConfig['sweeps']>
    tokenizers: string[]
    enabledAxes: SweepAxis[]
    seed: number
    axisSampleLines: AxisSampleLines
  },
  extras: Record<string, unknown> = {}
) {
  return {
    ...provenance,
    autosweep: {
      preset: runtimeConfig.preset,
      sample_lines: runtimeConfig.sampleLines,
      repeats: runtimeConfig.repeats,
      sweeps: runtimeConfig.sweeps,
      tokenizers: runtimeConfig.tokenizers,
      enabled_axes: runtimeConfig.enabledAxes,
      seed: runtimeConfig.seed,
      axis_sample_lines: runtimeConfig.axisSampleLines
    },
    ...extras
  }
}

async function processMutation(
  tokenizerId: string,
  tokenizerDisplayName: string,
  mutated: ReturnType<typeof mutateLine>,
  repeats: number,
  context: AutoSweepRowContext,
  tokenizerFamily: string | null,
  tokenizerVocabSize: number | null,
  debugTracker: Map<string, number>,
  runtimeConfig: {
    preset: 'fast' | 'full' | 'custom'
    sampleLines: number
    repeats: number
    sweeps: Required<AutoSweepJobConfig['sweeps']>
    tokenizers: string[]
    enabledAxes: SweepAxis[]
    seed: number
    axisSampleLines: AxisSampleLines
  }
): Promise<AutoSweepCsvRow> {
  const sanitizedText = sanitizeAndValidateInput(mutated.text)
  mutated.text = sanitizedText
  const asciiStats = measureAsciiBytes(sanitizedText)
  mutated.asciiRatio = asciiStats.ratio
  const measuredAsciiRatio = Number(asciiStats.ratio.toFixed(6))
  const xValue =
    context.sweepAxis === 'ascii_ratio' ? measuredAsciiRatio : context.xValue
  const resolvedTargetAsciiRatio = (() => {
    if (context.sweepAxis !== 'ascii_ratio') return null
    const candidate = context.targetXValue ?? context.xValue
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return Number(candidate)
    }
    if (typeof candidate === 'string') {
      const parsed = Number(candidate)
      return Number.isFinite(parsed) ? parsed : null
    }
    return null
  })()

  const measurementRepeats = Math.max(repeats, 5)

  const resultForMetrics: TokenizationResult = await tokenizeOnce(tokenizerId, sanitizedText)
  const encodeHandle = await getTokenizerEncodeHandle(tokenizerId)
  const preparedText = encodeHandle.preprocess ? encodeHandle.preprocess(sanitizedText) : sanitizedText

  const measureLatency = async (loops: number) => {
    const start = performance.now()
    for (let i = 0; i < loops; i += 1) {
      const outcome = encodeHandle.encode(preparedText)
      if (outcome && typeof (outcome as any).then === 'function') {
        await outcome
      }
    }
    const end = performance.now()
    return (end - start) / loops
  }

  const durations: number[] = []
  let loopsPerMeasurement = 1
  const trialDuration = await measureLatency(1)

  if (trialDuration < 0.5) {
    loopsPerMeasurement = 100
    for (let i = 0; i < measurementRepeats; i += 1) {
      durations.push(await measureLatency(loopsPerMeasurement))
    }
  } else {
    durations.push(trialDuration)
    for (let i = 1; i < measurementRepeats; i += 1) {
      durations.push(await measureLatency(loopsPerMeasurement))
    }
  }

  const medianValue = median(durations)
  const madValue = medianAbsoluteDeviation(durations, medianValue)
  const includeRuns = shouldCaptureTimingRuns(durations, medianValue)

  const tokenCount = resultForMetrics.metrics.tokenCount
  const graphemeCount = resultForMetrics.metrics.graphemeCount ?? resultForMetrics.metrics.charCount
  const codePointCount = resultForMetrics.metrics.codePointCount ?? graphemeCount
  const byteCount = resultForMetrics.metrics.byteCount
  const tokensPer100 = resultForMetrics.metrics.tokensPer100Graphemes ?? resultForMetrics.metrics.tokensPer100Chars
  const tokensPer100CodePoints = resultForMetrics.metrics.tokensPer100CodePoints ?? (codePointCount > 0 ? (tokenCount / codePointCount) * 100 : 0)
  const avgTokenLen = resultForMetrics.metrics.avgTokenLength ?? (tokenCount > 0 ? graphemeCount / tokenCount : 0)
  const unkCount = resultForMetrics.metrics.unkCount ?? 0
  const unkPercent = resultForMetrics.metrics.unkPercentage ?? (tokenCount > 0 ? (unkCount / tokenCount) * 100 : 0)

  const resultVocabSize = typeof resultForMetrics.vocabSize === 'number' && Number.isFinite(resultForMetrics.vocabSize)
    ? resultForMetrics.vocabSize
    : null
  const effectiveVocabSize = resultVocabSize ?? (typeof tokenizerVocabSize === 'number' && Number.isFinite(tokenizerVocabSize) ? tokenizerVocabSize : null)
  if (typeof effectiveVocabSize === 'number' && Number.isFinite(effectiveVocabSize)) {
    const modelEntry = AVAILABLE_MODELS.find((entry) => entry.id === tokenizerId)
    if (modelEntry) {
      modelEntry.vocabSize = effectiveVocabSize
    }
  }

  const resolvedUnkSamples = Array.isArray(resultForMetrics.unkTokenSamples) && resultForMetrics.unkTokenSamples.length
    ? resultForMetrics.unkTokenSamples.slice(0, 10)
    : undefined

  const debugKey = `${tokenizerId}::${context.slice}`
  const currentDebugCount = debugTracker.get(debugKey) ?? 0
  let debugSampleRank: number | null = null
  let debugTokenIdsJson: string | null = null
  let debugTokenStringsJson: string | null = null
  let debugTokensDisplayJson: string | null = null

  if (currentDebugCount < DEBUG_SAMPLES_PER_COMBO) {
    debugSampleRank = currentDebugCount + 1
    debugTracker.set(debugKey, debugSampleRank)

    const capturePayload = <T,>(values: readonly T[] | undefined, limit: number): string | null => {
      if (!values) return null
      const trimmed = values.slice(0, limit)
      const truncated = values.length > limit
      return JSON.stringify({ total: values.length, truncated, values: trimmed })
    }

    debugTokenIdsJson = capturePayload(resultForMetrics.ids, DEBUG_TOKEN_CAPTURE_LIMIT)
    debugTokenStringsJson = capturePayload(resultForMetrics.tokenStrings, DEBUG_TOKEN_CAPTURE_LIMIT)
    debugTokensDisplayJson = capturePayload(resultForMetrics.tokens, DEBUG_TOKEN_CAPTURE_LIMIT)
  }

  const provenance = getProvenanceInfo(tokenizerId, {
    displayName: tokenizerDisplayName,
    family: tokenizerFamily,
    vocabSize: effectiveVocabSize,
    addSpecialTokens: false,
    normalization: mutated.normalization,
    timingRuns: includeRuns ? durations : undefined
  })
  const provenancePayload = buildProvenancePayload(provenance, runtimeConfig, {
    cache_mode: 'job_warm_cache',
    encode_steady_state: {
      loops_per_repeat: loopsPerMeasurement,
      repeats: measurementRepeats
    },
    measured_ascii_ratio_bytes: measuredAsciiRatio,
    target_ascii_ratio: resolvedTargetAsciiRatio,
    ...(resolvedUnkSamples ? { unk_token_samples: resolvedUnkSamples } : {})
  })
  const provenanceJson = JSON.stringify(provenancePayload)

  const fragEntropyValue = Number.isFinite(resultForMetrics.metrics.fragEntropy)
    ? resultForMetrics.metrics.fragEntropy
    : 0
  return {
    slice: context.slice,
    lang_tag: context.langTag,
    template_id: context.templateId,
    sweep_axis: context.sweepAxis,
    x_value: xValue,
    target_ascii_ratio: resolvedTargetAsciiRatio,
    text: mutated.text,
  debug_sample_rank: debugSampleRank,
  debug_token_ids_json: debugTokenIdsJson,
  debug_token_strings_json: debugTokenStringsJson,
  debug_tokens_display_json: debugTokensDisplayJson,
    grapheme_count: graphemeCount,
    code_point_count: codePointCount,
    byte_count: byteCount,
    ascii_ratio_bytes: Number(asciiStats.ratio.toFixed(6)),
    tokenizer_id: tokenizerId,
    tokenizer_family: tokenizerFamily,
  tokenizer_vocab_size: effectiveVocabSize,
    add_special_tokens: false,
    token_count: tokenCount,
    tokens_per_100_chars: Number(tokensPer100.toFixed(6)),
    tokens_per_100_codepoints: Number(tokensPer100CodePoints.toFixed(6)),
    bytes_per_token: Number(resultForMetrics.metrics.bytesPerToken.toFixed(6)),
    avg_token_len_graphemes: Number(avgTokenLen.toFixed(6)),
    frag_entropy: Number(fragEntropyValue.toFixed(6)),
    unk_count: unkCount,
    unk_percent: Number(unkPercent.toFixed(6)),
    timed_op: 'encode_steady_state',
    time_ms_median: Number(medianValue.toFixed(3)),
    time_ms_mad: Number(madValue.toFixed(3)),
    repeats: measurementRepeats,
    normalization: mutated.normalization,
    zwj_applied: mutated.zwjApplied,
    url_applied: mutated.urlApplied,
    emoji_count: mutated.emojiCount,
    perturbations: mutated.perturbations,
    browser_ua: provenance.browser_ua,
    os_platform: provenance.os_platform,
    app_version: provenance.app_version,
    transformersjs_version: provenance.transformersjs_version,
    tiktoken_version: provenance.tiktoken_version,
    wasm_hash: provenance.wasm_hash,
    commit_sha: provenance.commit_sha,
    timestamp_utc: provenance.timestamp_utc,
    provenance_json: provenanceJson
  }
}

async function handleStart(config: AutoSweepJobConfig) {
  if (config.accessToken) {
    ;(globalThis as any).__HF_ACCESS_TOKEN = config.accessToken
  } else {
    delete (globalThis as any).__HF_ACCESS_TOKEN
  }

  const presetConfig = resolvePresetConfig(config)
  const sweeps = presetConfig.sweeps
  const enabledAxes = config.enabledAxes.filter((axis) => sweeps[axis]?.length)
  const flushEvery = config.flushEvery ?? DEFAULT_FLUSH_EVERY
  const seed = config.seed ?? hashSeed(config.jobId, config.lines.length, config.tokenizers.join(','))
  const axisSampleLines = presetConfig.axisSampleLines ?? {}
  const debugSampleTracker = new Map<string, number>()

  const requestedRepeats = config.repeats ?? presetConfig.repeats
  const runtimeRepeats = Math.max(requestedRepeats, 5)

  const axisSampleCounts = new Map<SweepAxis, number>()
  let maxSampleLines = presetConfig.sampleLines
  for (const axis of enabledAxes) {
    const override = axisSampleLines[axis]
    const count = Number.isFinite(override) && override ? override : presetConfig.sampleLines
    axisSampleCounts.set(axis, count)
    if (count > maxSampleLines) {
      maxSampleLines = count
    }
  }

  const runtimeConfig = {
    preset: config.preset,
    sampleLines: presetConfig.sampleLines,
    repeats: runtimeRepeats,
    sweeps,
    tokenizers: config.tokenizers,
    enabledAxes,
    seed,
    axisSampleLines
  }

  const samplingRng = new SeededRng(hashSeed(seed, 'sampling'))
  const masterSamples = sampleLines(config.lines, maxSampleLines, samplingRng)
  const filteredMasterSamples = masterSamples.filter(({ index, text }) => {
    const detectedSlice = tagSlice(text)
    if (detectedSlice === 'Hinglish' && !hasLatinAndDevanagari(text)) {
      console.warn(
        `[autosweep] Dropping template ${index} assigned to Hinglish because it lacks dual Latin/Devanagari scripts.`
      )
      return false
    }
    return true
  })

  const baselineSamples = filteredMasterSamples.slice(
    0,
    Math.min(runtimeConfig.sampleLines, filteredMasterSamples.length)
  )
  const axisSamples = new Map<SweepAxis, { index: number; text: string }[]>()

  for (const axis of enabledAxes) {
    const desired = axisSampleCounts.get(axis) ?? runtimeConfig.sampleLines
    if (desired <= baselineSamples.length) {
      axisSamples.set(axis, baselineSamples.slice(0, desired))
    } else {
      axisSamples.set(
        axis,
        filteredMasterSamples.slice(0, Math.min(desired, filteredMasterSamples.length))
      )
    }
  }

  const rowsPerTokenizer = baselineSamples.length + enabledAxes.reduce((sum, axis) => {
    const axisValues = sweeps[axis]?.length ?? 0
    const axisLines = axisSamples.get(axis)?.length ?? 0
    return sum + axisLines * axisValues
  }, 0)

  let totalRows = rowsPerTokenizer * runtimeConfig.tokenizers.length

  const startTime = performance.now()
  let processed = 0
  let chunk: AutoSweepCsvRow[] = []

  const postChunk = () => {
    if (chunk.length === 0) return
    const message: AutoSweepProgressMessage = {
      type: 'progress',
      processed,
      total: totalRows,
      rows: chunk
    }
  ;(self as any).postMessage(message)
    chunk = []
  }

  for (const tokenizerId of runtimeConfig.tokenizers) {
    const model = AVAILABLE_MODELS.find((entry) => entry.id === tokenizerId)
    const tokenizerDisplayName = model?.shortName ?? model?.name ?? tokenizerId
    const tokenizerFamily = model?.family ?? null
    const tokenizerVocabSize = typeof model?.vocabSize === 'number' ? model.vocabSize : null

    if (!warmedTokenizers.has(tokenizerId)) {
      await tokenizeForTiming(tokenizerId, 'warmup')
      warmedTokenizers.add(tokenizerId)
    }

    for (const { index, text } of baselineSamples) {
      const slice = tagSlice(text)
      const langTag = inferLanguageTag(slice, text)
      const templateId = `template-${index}`

      const baselineSettings: AutoSweepMutationSettings = { ...cloneBaseline() }
      const baselineRng = new SeededRng(hashSeed(seed, tokenizerId, index, 'baseline'))
      const baselineMutation = mutateLine(text, slice, baselineSettings, baselineRng)
      if (!isBaselineClean(baselineMutation)) {
        console.warn(
          `[autosweep] Skipping baseline row for template ${templateId} due to hygiene violation.`
        )
        totalRows = Math.max(totalRows - 1, 0)
        continue
      }
      const baselineRow = await processMutation(
        tokenizerId,
        tokenizerDisplayName,
        baselineMutation,
        runtimeConfig.repeats,
        {
          slice,
          langTag,
          templateId,
          sweepAxis: 'baseline',
          xValue: 'baseline'
        },
        tokenizerFamily,
        tokenizerVocabSize,
        debugSampleTracker,
        runtimeConfig
      )
      chunk.push(baselineRow)
      processed += 1
      if (chunk.length >= flushEvery) {
        postChunk()
      }
    }

    for (const { axis, values } of createSweepPlan(sweeps, enabledAxes)) {
      const linesForAxis = axisSamples.get(axis) ?? baselineSamples
      if (!values.length || !linesForAxis.length) {
        continue
      }

      for (const { index, text } of linesForAxis) {
        const slice = tagSlice(text)
        const langTag = inferLanguageTag(slice, text)
        const templateId = `template-${index}`

        for (const value of values) {
          const settings = mergeSettings(cloneBaseline(), axis, value)
          const axisRng = new SeededRng(hashSeed(seed, tokenizerId, index, axis, value))
          const mutated = mutateLine(text, slice, settings, axisRng)
          const targetValue = formatAxisValue(axis, value)
          const row = await processMutation(
            tokenizerId,
            tokenizerDisplayName,
            mutated,
            runtimeConfig.repeats,
            {
              slice,
              langTag,
              templateId,
              sweepAxis: axis,
              xValue: targetValue,
              targetXValue: targetValue
            },
            tokenizerFamily,
            tokenizerVocabSize,
            debugSampleTracker,
            runtimeConfig
          )
          chunk.push(row)
          processed += 1
          if (chunk.length >= flushEvery) {
            postChunk()
          }
        }
      }
    }
  }

  postChunk()

  const doneMessage: AutoSweepDoneMessage = {
    type: 'done',
    processed,
    total: totalRows,
    durationMs: performance.now() - startTime
  }
  ;(self as any).postMessage(doneMessage)
}

;(self as any).onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event
  if (!data || data.type !== 'start') {
    return
  }
  try {
    await handleStart(data.payload)
  } catch (error) {
    const message: AutoSweepWorkerMessage = {
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown AutoSweep error',
      stack: error instanceof Error ? error.stack : undefined
    }
  ;(self as any).postMessage(message)
  }
}
