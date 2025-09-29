import type { ModelCategory, TokenizationResult } from '../../tokenizers'

export type Mode = 'single' | 'compare' | 'batch' | 'auto'
export type TokenView = 'human' | 'raw' | 'ids' | 'offsets'

export interface ModeMeta {
  title: string
  description: string
  short: string
}

export const MODE_META: Record<Mode, ModeMeta> = {
  single: {
    title: 'Single tokenizer run',
    description: 'Inspect segmentation for one model.',
    short: 'Single'
  },
  compare: {
    title: 'Compare models',
    description: 'Line up metrics across all tokenizers.',
    short: 'Compare'
  },
  batch: {
    title: 'Batch analytics',
    description: 'Benchmark many snippets & export.',
    short: 'Batch'
  },
  auto: {
    title: 'Auto sweeps',
    description: 'Run preset sweeps across tokenizers with AutoSweep.',
    short: 'Auto'
  }
}

export interface TokenViewOption {
  value: TokenView
  label: string
}

export const TOKEN_VIEW_OPTIONS: TokenViewOption[] = [
  { value: 'human', label: 'Readable slices' },
  { value: 'raw', label: 'Model tokens' },
  { value: 'ids', label: 'Token IDs' },
  { value: 'offsets', label: 'Offsets' }
]

export interface MetricField {
  key: keyof TokenizationResult['metrics']
  label: string
  format?: (value: number) => string
}

export const METRIC_FIELDS: MetricField[] = [
  { key: 'tokenCount', label: 'Tokens' },
  { key: 'charCount', label: 'Characters' },
  { key: 'byteCount', label: 'Bytes' },
  { key: 'tokensPer100Chars', label: 'Tokens / 100 chars', format: (value) => value.toFixed(2) },
  { key: 'bytesPerToken', label: 'Bytes / token', format: (value) => value.toFixed(2) },
  { key: 'avgTokenLength', label: 'Avg. token length', format: (value) => value.toFixed(2) },
  {
    key: 'unkPercentage',
    label: 'UNK %',
    format: (value) => `${value.toFixed(2)}%`
  }
]

export const CATEGORY_LABELS: Record<ModelCategory, string> = {
  basic: 'General purpose',
  indian: 'Indic language specialists',
  frontier: 'Frontier and production stacks'
}
