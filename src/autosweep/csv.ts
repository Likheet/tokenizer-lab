import type { AutoSweepCsvRow } from './types'

export const AUTOSWEEP_CSV_COLUMNS: readonly (keyof AutoSweepCsvRow)[] = [
  'slice',
  'lang_tag',
  'template_id',
  'sweep_axis',
  'x_value',
  'text',
  'grapheme_count',
  'byte_count',
  'ascii_ratio_bytes',
  'tokenizer_id',
  'tokenizer_family',
  'tokenizer_vocab_size',
  'add_special_tokens',
  'token_count',
  'tokens_per_100_chars',
  'bytes_per_token',
  'avg_token_len_graphemes',
  'unk_count',
  'unk_percent',
  'timed_op',
  'time_ms_median',
  'time_ms_mad',
  'repeats',
  'normalization',
  'zwj_applied',
  'url_applied',
  'emoji_count',
  'perturbations',
  'browser_ua',
  'os_platform',
  'app_version',
  'transformersjs_version',
  'tiktoken_version',
  'wasm_hash',
  'commit_sha',
  'timestamp_utc',
  'provenance_json'
] as const

const ESCAPE_PATTERN = /[",\n\r]/

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return ''
  }
  const stringValue = String(value)
  if (!ESCAPE_PATTERN.test(stringValue)) {
    return stringValue
  }
  return `"${stringValue.replace(/"/g, '""')}"`
}

export const AUTOSWEEP_CSV_HEADER = AUTOSWEEP_CSV_COLUMNS.join(',')

export function autoSweepRowToCsv(row: AutoSweepCsvRow): string {
  return AUTOSWEEP_CSV_COLUMNS.map((column) => escapeCsv(row[column])).join(',')
}
