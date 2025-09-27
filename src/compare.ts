import { tokenizeOnce, AVAILABLE_MODELS } from './tokenizers'

export const COMPARISON_REPOS = AVAILABLE_MODELS.map(model => model.id)

export async function compareAll(text: string) {
  const jobs = COMPARISON_REPOS.map(async (repo) => {
    const result = await tokenizeOnce(repo, text)
    return { repo, ...result }
  })

  return Promise.all(jobs)
}

export type Row = {
  repo: string
  text: string
  tokens: number
  chars: number
  bytes: number
  tokens_per_100_chars: number
  bytes_per_token: number
  avg_token_chars: number
  unk_rate: number
}

export async function runBatch(repos: string[], lines: string[]): Promise<Row[]> {
  const rows: Row[] = []
  for (const repo of repos) {
    for (const text of lines) {
      const result = await tokenizeOnce(repo, text)
      rows.push({
        repo,
        text,
        tokens: result.metrics.tokenCount,
        chars: result.metrics.charCount,
        bytes: result.metrics.byteCount,
        tokens_per_100_chars: result.metrics.tokensPer100Chars,
        bytes_per_token: result.metrics.bytesPerToken,
        avg_token_chars: result.metrics.avgTokenLength,
        unk_rate: result.metrics.unkPercentage ?? 0
      })
    }
  }
  return rows
}

export function toCSV(rows: Row[]) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0]) as (keyof Row)[]
  const esc = (v: any) => /["\n,]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v)
  return [cols.join(','), ...rows.map(r => cols.map(k => esc(r[k])).join(','))].join('\n')
}

export function downloadCSV(name: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const anchor = document.createElement('a')
  anchor.href = URL.createObjectURL(blob)
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(anchor.href)
}

export type Slice = 'Hindi' | 'Hinglish' | 'Kannada' | 'English' | 'Mixed'

export function tagSlice(text: string): Slice {
  const hasKannada = /[\u0C80-\u0CFF]/.test(text)
  const hasDevanagari = /[\u0900-\u097F]/.test(text)
  const hasLatin = /[A-Za-z]/.test(text)
  const hasUrlOrSymbol = /https?:|[@:#-]/.test(text)
  const hasEmojiLike = /[\u2600-\u27BF\u1F300-\u1FAFF]/.test(text)

  if (hasKannada) return 'Kannada'
  if (hasDevanagari && hasLatin) return 'Hinglish'
  if (hasDevanagari) return 'Hindi'
  if (hasLatin && (hasEmojiLike || hasUrlOrSymbol)) return 'Mixed'
  if (hasLatin) return 'English'
  if (hasEmojiLike || hasUrlOrSymbol) return 'Mixed'
  return 'Mixed'
}

export type SummaryRow = {
  repo: string
  slice: Slice
  mean_tokens: number
  mean_tokens_per_100: number
  mean_bytes_per_token: number
  mean_unk: number
}

export function summarize(rows: Row[]): SummaryRow[] {
  const key = (row: Row) => `${row.repo}|${tagSlice(row.text)}`
  const acc = new Map<string, { n: number; tokens: number; bytesPerToken: number; tokensPer100: number; unk: number }>()

  for (const row of rows) {
    const bucketKey = key(row)
    const bucket = acc.get(bucketKey) ?? { n: 0, tokens: 0, bytesPerToken: 0, tokensPer100: 0, unk: 0 }
    bucket.n += 1
    bucket.tokens += row.tokens
    bucket.bytesPerToken += row.bytes_per_token
    bucket.tokensPer100 += row.tokens_per_100_chars
    bucket.unk += row.unk_rate
    acc.set(bucketKey, bucket)
  }

  return Array.from(acc, ([bucketKey, bucket]) => {
    const [repo, slice] = bucketKey.split('|')
    const divisor = Math.max(1, bucket.n)
    return {
      repo,
      slice: slice as Slice,
      mean_tokens: bucket.tokens / divisor,
      mean_tokens_per_100: bucket.tokensPer100 / divisor,
      mean_bytes_per_token: bucket.bytesPerToken / divisor,
      mean_unk: bucket.unk / divisor
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
