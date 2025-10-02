import { SeededRng } from './rng'
import type { AutoSweepMutationResult, AutoSweepMutationSettings } from './types'
import type { Slice } from '../compare'

const ASCII_FILLERS = [' la', ' the', ' ok', ' yes', ' go', ' hi', ' do', ' run', ' test', ' beta'] as const
const NON_ASCII_FILLERS: Record<Slice | 'default', readonly string[]> = {
  Hindi: [' नमस्ते', ' कृपा', ' दुनिया', ' मित्रों', ' कविता'],
  Hinglish: [' नमस्ते', ' दुनिया', ' café', ' résumé', ' jalebi'],
  Kannada: [' ಬೆಂಗಳೂರು', ' ಕನ್ನಡ', ' ಮೈಸೂರು', ' ಪರೀಕ್ಷೆ', ' ಊಟ'],
  Tamil: [' சென்னை', ' தமிழ்', ' காப்பி', ' நண்பா', ' விழா'],
  English: [' café', ' façade', ' naïve', ' piñata', ' jalapeño'],
  Mixed: [' नमस्ते', ' café', ' ಕನ್ನಡ', ' தமிழ்', ' दुनिया'],
  default: [' नमस्ते', ' café', ' दुनिया', ' ಕನ್ನಡ', ' தமிழ்']
}
const EMOJI_BANK = ['🙂', '🙏🏻', '🔥', '⭐', '🚀', '🎉', '✨', '💡', '🧠', '📈'] as const
const AUTO_URL = ' https://example.com?q=hi'
const INSERTION_CHARS = 'abcdefghijklmnopqrstuvwxyz'
const PUNCTUATION = ['.', ',', '!', '?'] as const
const ASCII_RATIO_TOLERANCE = 0.02
const MAX_ASCII_ATTEMPTS = 120

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

function pickFrom<T>(pool: readonly T[], rng: SeededRng): T {
  if (!pool.length) {
    throw new Error('Attempted to pick from an empty pool')
  }
  const index = rng.nextInt(pool.length)
  return pool[index]
}

function applyAsciiRatio(
  baseText: string,
  targetRatio: number,
  rng: SeededRng,
  slice: Slice
): { text: string; ratio: number } {
  if (!Number.isFinite(targetRatio) || targetRatio < 0) {
    return { text: baseText, ratio: computeAsciiRatio(baseText) }
  }

  const clampedTarget = Math.min(Math.max(targetRatio, 0), 1)
  let text = baseText
  let ratio = computeAsciiRatio(text)

  if (Math.abs(ratio - clampedTarget) <= ASCII_RATIO_TOLERANCE) {
    return { text, ratio }
  }

  let attempts = 0

  if (ratio < clampedTarget - ASCII_RATIO_TOLERANCE) {
    while (ratio < clampedTarget - ASCII_RATIO_TOLERANCE && attempts < MAX_ASCII_ATTEMPTS) {
      const filler = pickFrom(ASCII_FILLERS, rng)
      text += filler
      attempts += 1
      ratio = computeAsciiRatio(text)
    }
    return { text, ratio }
  }

  const fillerPool = NON_ASCII_FILLERS[slice] ?? NON_ASCII_FILLERS.default
  while (ratio > clampedTarget + ASCII_RATIO_TOLERANCE && attempts < MAX_ASCII_ATTEMPTS) {
    const filler = pickFrom(fillerPool, rng)
    text += filler
    attempts += 1
    ratio = computeAsciiRatio(text)
    if (clampedTarget === 0 && ratio <= ASCII_RATIO_TOLERANCE) {
      break
    }
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

function ensureZwjContext(text: string, slice: Slice): string {
  if (slice === 'Hindi' || slice === 'Hinglish') {
    if (!/\u0915\u094d\u0937/.test(text) && !/\u0915\u094d\u0930/.test(text)) {
      return `${text} क्ष` // add plain consonant cluster without ZWJ
    }
  }

  if (slice === 'Kannada') {
    if (!/\u0c95\u0ccd\u0cb7/.test(text)) {
      return `${text} ಕ್ಷ`
    }
  }

  if (slice === 'Tamil') {
    if (!/\u0b95\u0bcd\u0bb7/.test(text)) {
      return `${text} க்ஷ`
    }
  }

  return text
}

function applyZwjVariant(text: string, slice: Slice): { text: string; applied: number } {
  if (slice === 'Hindi' || slice === 'Hinglish') {
    if (/\u0915\u094d\u0937/.test(text)) {
      return {
        text: text.replace(/\u0915\u094d\u0937/g, '\u0915\u094d\u200d\u0937'),
        applied: 1
      }
    }
    if (/\u0915\u094d\u0930/.test(text)) {
      return {
        text: text.replace(/\u0915\u094d\u0930/g, '\u0915\u094d\u200d\u0930'),
        applied: 1
      }
    }
  }

  if (slice === 'Kannada') {
    if (/\u0c95\u0ccd\u0cb7/.test(text)) {
      return {
        text: text.replace(/\u0c95\u0ccd\u0cb7/g, '\u0c95\u0ccd\u200d\u0cb7'),
        applied: 1
      }
    }
  }

  if (slice === 'Tamil') {
    const idx = text.indexOf('\u0b95\u0bcd\u0bb7')
    if (idx >= 0) {
      const mutated =
        text.slice(0, idx) + '\u0b95\u0bcd\u200d\u0bb7' + text.slice(idx + 3)
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
  let text = ensureZwjContext(baseText, slice)
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

  const asciiResult = applyAsciiRatio(text, settings.ascii_ratio ?? 0, rng, slice)
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
