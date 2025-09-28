import { SeededRng } from './rng'
import type { AutoSweepMutationResult, AutoSweepMutationSettings } from './types'
import type { Slice } from '../compare'

const ASCII_FILLERS = [' la', ' the', ' ok', ' yes', ' go', ' hi', ' do', ' run', ' test', ' beta'] as const
const EMOJI_BANK = ['🙂', '🙏🏻', '🔥', '🌟', '🚀', '🎉', '✨', '💡', '🧠', '📈'] as const
const AUTO_URL = ' https://example.com?q=hi'

function computeAsciiRatio(text: string): number {
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
  if (targetRatio <= 0) {
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
  if (count <= 0) return baseText
  const pieces: string[] = []
  for (let i = 0; i < count; i += 1) {
    const emoji = EMOJI_BANK[i % EMOJI_BANK.length]
    pieces.push(emoji)
  }
  return ${baseText} .trim()
}

function applyUrl(baseText: string, enabled: boolean): { text: string; applied: number } {
  if (!enabled) {
    return { text: baseText, applied: 0 }
  }
  if (baseText.includes('https://')) {
    return { text: baseText, applied: 0 }
  }
  return { text: ${baseText}, applied: 1 }
}

function applyZwjVariant(text: string, slice: Slice): { text: string; applied: number } {
  if (slice === 'Hindi' || slice === 'Hinglish') {
    const match = text.match(/क्र|क्ष/)
    if (match && match.index !== undefined) {
      const target = match[0]
      const replacement = target === 'क्ष' ? 'क्‍ष' : 'क्‍र'
      return { text: text.replace(target, replacement), applied: 1 }
    }
  }
  if (slice === 'Tamil') {
    const idx = text.indexOf('க்')
    if (idx >= 0) {
      const replacement = 'க்00D'
      const mutated = text.slice(0, idx) + replacement + text.slice(idx + 2)
      return { text: mutated, applied: 1 }
    }
  }
  return { text, applied: 0 }
}

function applyPerturbations(baseText: string, count: number, rng: SeededRng): string {
  let text = baseText
  for (let i = 0; i < count; i += 1) {
    if (text.length === 0) break
    const mode = rng.nextInt(3)
    switch (mode) {
      case 0: {
        const index = rng.nextInt(text.length + 1)
        text = ${text.slice(0, index)} 
        break
      }
      case 1: {
        if (text.length < 2) break
        const index = rng.nextInt(text.length - 1)
        const chars = text.split('')
        const tmp = chars[index]
        chars[index] = chars[index + 1]
        chars[index + 1] = tmp
        text = chars.join('')
        break
      }
      case 2: {
        const punctuation = ['.', ',', '!', '?']
        const index = rng.nextInt(text.length)
        const replacement = punctuation[rng.nextInt(punctuation.length)]
        text = ${text.slice(0, index)}
        break
      }
      default:
        break
    }
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

  text = appendEmojis(text, settings.emoji_count)

  text = applyPerturbations(text, settings.perturbations, rng)

  const asciiResult = applyAsciiRatio(text, settings.ascii_ratio, rng)
  text = asciiResult.text

  const normalization = settings.normalize || 'NFC'
  if (typeof text.normalize === 'function') {
    try {
      text = text.normalize(normalization as 'NFC' | 'NFD')
    } catch {
      // Fallback silently if normalization fails
    }
  }

  const finalRatio = computeAsciiRatio(text)

  return {
    text,
    asciiRatio: finalRatio,
    normalization,
    emojiCount: settings.emoji_count,
    urlApplied: urlResult.applied,
    zwjApplied,
    perturbations: settings.perturbations
  }
}

export { computeAsciiRatio }
