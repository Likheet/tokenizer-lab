import {
  tokenizeOnce,
  tokenizeForTiming,
  AVAILABLE_MODELS,
  getTokenizerEncodeHandle,
  sanitizeAndValidateInput
} from '../tokenizers'
import { tagSlice, inferLanguageTag, getProvenanceInfo } from '../compare'
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
  AutoSweepDoneMessage
} from './types'
import type { Slice } from '../compare'
import type { TokenizationResult } from '../tokenizers'

/// <reference lib="webworker" />

type WorkerRequest = { type: 'start'; payload: AutoSweepJobConfig }

const DEFAULT_FLUSH_EVERY = 200

const warmedTokenizers = new Set<string>()

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

function sampleLines(
  lines: string[],
  sampleCount: number,
  rng: SeededRng
): { index: number; text: string }[] {
  const filtered: { index: number; text: string }[] = []
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (trimmed.length) {
      filtered.push({ index, text: trimmed })
    }
  })

  if (filtered.length <= sampleCount) {
    return filtered
  }

  const indices = filtered.map((_, idx) => idx)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = rng.nextInt(i + 1)
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices.slice(0, sampleCount).map((idx) => filtered[idx])
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
      sweeps: normalizeConfigSweeps(config.sweeps)
    }
  }
  const preset = AUTOSWEEP_PRESETS[config.preset]
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
    })
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
      seed: runtimeConfig.seed
    },
    ...extras
  }
}

async function processMutation(
  tokenizerId: string,
  tokenizerDisplayName: string,
  mutated: ReturnType<typeof mutateLine>,
  repeats: number,
  context: {
    slice: Slice
    langTag: string
    templateId: string
    sweepAxis: string
    xValue: string | number
  },
  tokenizerFamily: string | null,
  tokenizerVocabSize: number | null,
  runtimeConfig: {
    preset: 'fast' | 'full' | 'custom'
    sampleLines: number
    repeats: number
    sweeps: Required<AutoSweepJobConfig['sweeps']>
    tokenizers: string[]
    enabledAxes: SweepAxis[]
    seed: number
  }
): Promise<AutoSweepCsvRow> {
  const sanitizedText = sanitizeAndValidateInput(mutated.text)
  mutated.text = sanitizedText

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
  const graphemeCount = resultForMetrics.metrics.charCount
  const byteCount = resultForMetrics.metrics.byteCount
  const tokensPer100 = graphemeCount > 0 ? (tokenCount / Math.max(1, graphemeCount)) * 100 : 0
  const avgTokenLen = tokenCount > 0 ? graphemeCount / tokenCount : 0
  const unkCount = resultForMetrics.metrics.unkCount ?? 0
  const unkPercent = resultForMetrics.metrics.unkPercentage ?? (tokenCount > 0 ? (unkCount / tokenCount) * 100 : 0)

  const provenance = getProvenanceInfo(tokenizerId, {
    displayName: tokenizerDisplayName,
    family: tokenizerFamily,
    vocabSize: tokenizerVocabSize,
    addSpecialTokens: false,
    normalization: mutated.normalization,
    timingRuns: includeRuns ? durations : undefined
  })
  const provenancePayload = buildProvenancePayload(provenance, runtimeConfig, {
    cache_mode: 'job_warm_cache',
    encode_steady_state: {
      loops_per_repeat: loopsPerMeasurement,
      repeats: measurementRepeats
    }
  })
  const provenanceJson = JSON.stringify(provenancePayload)

  return {
    slice: context.slice,
    lang_tag: context.langTag,
    template_id: context.templateId,
    sweep_axis: context.sweepAxis,
    x_value: context.xValue,
    text: mutated.text,
    grapheme_count: graphemeCount,
    byte_count: byteCount,
    ascii_ratio_bytes: mutated.asciiRatio,
    tokenizer_id: tokenizerId,
    tokenizer_family: tokenizerFamily,
    tokenizer_vocab_size: tokenizerVocabSize,
    add_special_tokens: false,
    token_count: tokenCount,
    tokens_per_100_chars: Number(tokensPer100.toFixed(6)),
    bytes_per_token: Number(resultForMetrics.metrics.bytesPerToken.toFixed(6)),
    avg_token_len_graphemes: Number(avgTokenLen.toFixed(6)),
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

  const requestedRepeats = config.repeats ?? presetConfig.repeats
  const runtimeRepeats = Math.max(requestedRepeats, 5)

  const runtimeConfig = {
    preset: config.preset,
    sampleLines: presetConfig.sampleLines,
    repeats: runtimeRepeats,
    sweeps,
    tokenizers: config.tokenizers,
    enabledAxes,
    seed
  }

  const samplingRng = new SeededRng(hashSeed(seed, 'sampling'))
  const sampled = sampleLines(config.lines, runtimeConfig.sampleLines, samplingRng)

  const totalPerLine = 1 + enabledAxes.reduce((sum, axis) => sum + (sweeps[axis]?.length ?? 0), 0)
  const totalRows = sampled.length * runtimeConfig.tokenizers.length * totalPerLine

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
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message)
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

    for (const { index, text } of sampled) {
      const slice = tagSlice(text)
      const langTag = inferLanguageTag(slice, text)
      const templateId = `template-${index}`

      const baselineSettings: AutoSweepMutationSettings = { ...cloneBaseline() }
      const baselineRng = new SeededRng(hashSeed(seed, tokenizerId, index, 'baseline'))
      const baselineMutation = mutateLine(text, slice, baselineSettings, baselineRng)
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
        runtimeConfig
      )
      chunk.push(baselineRow)
      processed += 1
      if (chunk.length >= flushEvery) {
        postChunk()
      }

      for (const { axis, values } of createSweepPlan(sweeps, enabledAxes)) {
        for (const value of values) {
          const settings = mergeSettings(cloneBaseline(), axis, value)
          const axisRng = new SeededRng(hashSeed(seed, tokenizerId, index, axis, value))
          const mutated = mutateLine(text, slice, settings, axisRng)
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
              xValue: formatAxisValue(axis, value)
            },
            tokenizerFamily,
            tokenizerVocabSize,
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
  ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(doneMessage)
}

;(self as unknown as DedicatedWorkerGlobalScope).onmessage = async (event: MessageEvent<WorkerRequest>) => {
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
    ;(self as unknown as DedicatedWorkerGlobalScope).postMessage(message)
  }
}
