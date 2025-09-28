import type { Slice } from '../compare'

export type SweepAxis =
  | 'ascii_ratio'
  | 'emoji_count'
  | 'url_on'
  | 'normalize'
  | 'zwj_on'
  | 'perturbations'

export interface SweepConfig {
  ascii_ratio?: number[]
  emoji_count?: number[]
  url_on?: number[]
  normalize?: string[]
  zwj_on?: number[]
  perturbations?: number[]
}

export interface AutoSweepPreset {
  id: 'fast' | 'full'
  label: string
  description: string
  sampleLines: number
  repeats: number
  sweeps: SweepConfig
}

export interface AutoSweepJobConfig {
  jobId: string
  lines: string[]
  tokenizers: string[]
  sweeps: SweepConfig
  enabledAxes: SweepAxis[]
  preset: 'fast' | 'full' | 'custom'
  sampleLines: number
  repeats: number
  flushEvery?: number
  seed?: number
}

export interface AutoSweepRuntimeConfig {
  jobId: string
  preset: 'fast' | 'full' | 'custom'
  sampleLines: number
  repeats: number
  sweeps: SweepConfig
  tokenizers: string[]
  enabledAxes: SweepAxis[]
  seed: number
}

export interface AutoSweepProgressMessage {
  type: 'progress'
  processed: number
  total: number
  rows: AutoSweepCsvRow[]
}

export interface AutoSweepDoneMessage {
  type: 'done'
  processed: number
  total: number
  durationMs: number
}

export interface AutoSweepErrorMessage {
  type: 'error'
  message: string
  stack?: string
}

export type AutoSweepWorkerMessage =
  | AutoSweepProgressMessage
  | AutoSweepDoneMessage
  | AutoSweepErrorMessage

export interface AutoSweepBaselineConfig {
  ascii_ratio: number
  emoji_count: number
  url_on: number
  normalize: string
  zwj_on: number
  perturbations: number
}

export interface AutoSweepMutationSettings extends AutoSweepBaselineConfig {}

export interface AutoSweepMutationResult {
  text: string
  asciiRatio: number
  normalization: string
  emojiCount: number
  urlApplied: number
  zwjApplied: number
  perturbations: number
}

export interface AutoSweepRowContext {
  slice: Slice
  langTag: string
  templateId: string
  sweepAxis: SweepAxis | 'baseline'
  xValue: string
}

export interface AutoSweepCsvRow {
  slice: Slice
  lang_tag: string
  template_id: string
  sweep_axis: string
  x_value: string
  text: string
  grapheme_count: number
  byte_count: number
  ascii_ratio_bytes: number
  tokenizer_id: string
  tokenizer_family: string | null
  tokenizer_vocab_size: number | null
  add_special_tokens: boolean
  token_count: number
  tokens_per_100_chars: number
  bytes_per_token: number
  avg_token_len_graphemes: number
  unk_count: number
  unk_percent: number
  time_ms_median: number
  time_ms_mad: number
  repeats: number
  normalization: string
  zwj_applied: number
  url_applied: number
  emoji_count: number
  perturbations: number
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
