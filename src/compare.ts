import { tokenizeOnce, AVAILABLE_MODELS } from './tokenizers'

export const COMPARISON_REPOS = AVAILABLE_MODELS.map(model => model.id)

export async function compareAll(text: string) {
  const out = []
  for (const repo of COMPARISON_REPOS) {
    const r = await tokenizeOnce(repo, text)
    out.push({ repo, ...r })
  }
  return out
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
      const r = await tokenizeOnce(repo, text)
      rows.push({
        repo,
        text,
        tokens: r.metrics.tokenCount,
        chars: r.metrics.charCount,
        bytes: r.metrics.byteCount,
        tokens_per_100_chars: r.metrics.tokensPer100Chars,
        bytes_per_token: r.metrics.bytesPerToken,
        avg_token_chars: r.metrics.avgTokenLength,
        unk_rate: r.metrics.unkPercentage ?? 0
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
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  URL.revokeObjectURL(a.href)
}

export type Slice = 'Hindi' | 'Hinglish' | 'Kannada' | 'English' | 'Mixed'

export function tagSlice(s: string): Slice {
  // quick rules; customize as you like
  if (/[ಂಅ-ಹ]/.test(s)) return 'Kannada'
  if (/[ऀ-ॿ]/.test(s)) return 'Hindi'
  if (/https?:|[@:#-]/.test(s) || /😂|🙏/.test(s)) return 'Mixed'
  if (/[a-z]/i.test(s) && /[ऀ-ॿ]/.test(s)) return 'Hinglish'
  if (/^[\x00-\x7F]+$/.test(s)) return 'English'
  return 'Mixed'
}

export function summarize(rows: Row[]) {
  const key = (r: Row) => `${r.repo}|${tagSlice(r.text)}`
  const acc = new Map<string, { n: number, t: number, bpt: number, t100: number, unk: number }>()
  
  for (const r of rows) {
    const k = key(r)
    const v = acc.get(k) ?? { n: 0, t: 0, bpt: 0, t100: 0, unk: 0 }
    v.n++
    v.t += r.tokens
    v.bpt += r.bytes_per_token
    v.t100 += r.tokens_per_100_chars
    v.unk += r.unk_rate
    acc.set(k, v)
  }
  
  return Array.from(acc, ([k, v]) => {
    const [repo, slice] = k.split('|')
    return {
      repo,
      slice,
      mean_tokens: v.t / v.n,
      mean_tokens_per_100: v.t100 / v.n,
      mean_bytes_per_token: v.bpt / v.n,
      mean_unk: v.unk / v.n
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