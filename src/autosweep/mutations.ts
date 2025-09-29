import { SeededRng } from './rng'
import type { AutoSweepMutationResult, AutoSweepMutationSettings } from './types'
import type { Slice } from '../compare'

const ASCII_FILLERS = [' la', ' the', ' ok', ' yes', ' go', ' hi', ' do', ' run', ' test', ' beta'] as const
const EMOJI_BANK = ['🙂', '🙏🏻', '🔥', '⭐', '🚀', '🎉', '✨', '💡', '🧠', '📈'] as const
const AUTO_URL = ' https://example.com?q=hi'
const INSERTION_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const PUNCTUATION = ['.', ',', '!', '?'] as const

export function computeAsciiRatio(text: string): number {
  if (!text) return 0
  const encoder = new TextEncoder()
  const bytes = encoder.encode(text)
  if (bytes.length === 0) return 0
  let asciiBytes = 0
  for (const byte of bytes) {
    if (byte <= 0x7f) asciiBytes += 1
  }
  return asciiBytes / bytes.length
}

function applyAsciiRatio(
  baseText: string,
  targetRatio: number,
  rng: SeededRng
): { text: string; ratio: number } {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0) {
    return { text: baseText, ratio: computeAsciiRatio(baseText) }
  }

  let text = baseText
  let attempts = 0
  let ratio = computeAsciiRatio(text)

  while (ratio < targetRatio && attempts < 50) {
    const filler = ASCII_FILLERS[attempts % ASCII_FILLERS.length]
    text += filler
    attempts += 1
    ratio = computeAsciiRatio(text)
  }

  return { text, ratio }
}

function appendEmojis(baseText: string, count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return baseText
  }

  const pieces: string[] = []
  for (let i = 0; i < count; i += 1) {
    pieces.push(EMOJI_BANK[i % EMOJI_BANK.length])
  }

  const suffix = pieces.join(' ')
  const trimmed = baseText.trimEnd()
  return `${trimmed}${trimmed ? ' ' : ''}${suffix}`
}

function applyUrl(baseText: string, enabled: boolean): { text: string; applied: number } {
  if (!enabled) {
    return { text: baseText, applied: 0 }
  }

  if (baseText.includes('https://')) {
    return { text: baseText, applied: 0 }
  }

  return { text: `${baseText}${AUTO_URL}`, applied: 1 }
}

function applyZwjVariant(text: string, slice: Slice): { text: string; applied: number } {
  if (slice === 'Hindi' || slice === 'Hinglish') {
    const match = text.match(/\u0915\u094d\u0930|\u0915\u094d\u0937/)
    if (match && match.index !== undefined) {
      const target = match[0]
      const replacement = target === '\u0915\u094d\u0937' ? '\u0915\u094d\u200d\u0937' : '\u0915\u094d\u200d\u0930'
      return { text: text.replace(target, replacement), applied: 1 }
    }
  }

  if (slice === 'Tamil') {
    const idx = text.indexOf('\u0b95\u0bcd')
    if (idx >= 0) {
      const replacement = '\u0b95\u0bcd\u200d'
      const mutated = text.slice(0, idx) + replacement + text.slice(idx + 2)
      return { text: mutated, applied: 1 }
    }
  }

  return { text, applied: 0 }
}

function randomInsertionChar(rng: SeededRng): string {
  const index = rng.nextInt(INSERTION_CHARS.length)
  return INSERTION_CHARS.charAt(index)
}

function applyPerturbations(baseText: string, count: number, rng: SeededRng): string {
  if (!Number.isFinite(count) || count <= 0) {
    return baseText
  }

  let text = baseText

  for (let i = 0; i < count; i += 1) {
    if (!text.length) break

    const mode = rng.nextInt(3)

    if (mode === 0) {
      const insertIndex = rng.nextInt(text.length + 1)
      const char = randomInsertionChar(rng)
      text = `${text.slice(0, insertIndex)}${char}${text.slice(insertIndex)}`
      continue
    }

    if (mode === 1) {
      if (text.length < 2) continue
      const swapIndex = rng.nextInt(text.length - 1)
      const chars = text.split('')
      const tmp = chars[swapIndex]
      chars[swapIndex] = chars[swapIndex + 1]
      chars[swapIndex + 1] = tmp
      text = chars.join('')
      continue
    }

    const replaceIndex = rng.nextInt(text.length)
    const replacement = PUNCTUATION[rng.nextInt(PUNCTUATION.length)]
    text = `${text.slice(0, replaceIndex)}${replacement}${text.slice(replaceIndex + 1)}`
  }

  return text
}

export function mutateLine(
  baseText: string,
  slice: Slice,
  settings: AutoSweepMutationSettings,
  rng: SeededRng
): AutoSweepMutationResult {
  let text = baseText
  let zwjApplied = 0

  if (settings.zwj_on) {
    const zwjResult = applyZwjVariant(text, slice)
    text = zwjResult.text
    zwjApplied = zwjResult.applied
  }

  const urlResult = applyUrl(text, settings.url_on === 1)
  text = urlResult.text

  text = appendEmojis(text, settings.emoji_count ?? 0)

  text = applyPerturbations(text, settings.perturbations ?? 0, rng)

  const asciiResult = applyAsciiRatio(text, settings.ascii_ratio ?? 0, rng)
  text = asciiResult.text

  const normalization = settings.normalize || 'NFC'
  if (typeof text.normalize === 'function') {
    try {
      text = text.normalize(normalization as 'NFC' | 'NFD')
    } catch {
      // Ignore invalid normalization requests
    }
  }

  const finalRatio = computeAsciiRatio(text)

  return {
    text,
    asciiRatio: finalRatio,
    normalization,
    emojiCount: settings.emoji_count ?? 0,
    urlApplied: urlResult.applied,
    zwjApplied,
    perturbations: settings.perturbations ?? 0
  }
}
