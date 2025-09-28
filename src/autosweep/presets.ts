import type { AutoSweepPreset, SweepConfig } from './types'

const FAST_SWEEP: SweepConfig = {
  ascii_ratio: [0, 0.25, 0.5, 0.75, 1],
  emoji_count: [0, 1, 2, 3],
  url_on: [0, 1],
  normalize: ['NFC', 'NFD'],
  zwj_on: [0, 1],
  perturbations: [0, 1, 2]
}

const FULL_SWEEP: SweepConfig = {
  ascii_ratio: Array.from({ length: 11 }, (_, index) => Number((index * 0.1).toFixed(1))),
  emoji_count: [0, 1, 2, 3, 4, 5],
  url_on: [0, 1],
  normalize: ['NFC', 'NFD'],
  zwj_on: [0, 1],
  perturbations: [0, 1, 2, 3, 4, 5]
}

export const AUTOSWEEP_PRESETS: Record<'fast' | 'full', AutoSweepPreset> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    description: 'Quick sweep for exploratory analysis',
    sampleLines: 10,
    repeats: 3,
    sweeps: FAST_SWEEP
  },
  full: {
    id: 'full',
    label: 'Full',
    description: 'Comprehensive sweep for publication-ready runs',
    sampleLines: 25,
    repeats: 5,
    sweeps: FULL_SWEEP
  }
}

export const DEFAULT_BASELINE_SETTINGS = {
  ascii_ratio: 0,
  emoji_count: 0,
  url_on: 0,
  normalize: 'NFC',
  zwj_on: 0,
  perturbations: 0
} as const
