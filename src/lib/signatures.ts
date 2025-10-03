import type { ModelInfo, TokenizerFamily } from '../tokenizers'

export type TokenizerSignature = {
  tokenizerId: string
  family: string
  vocabSize: number | null
  unkToken: string
  specialTokens: string[]
  normalization: string
  source: string
  mergesSample: string | null
  signatureKey: string
}

const DEFAULT_SPECIAL_TOKENS: Record<TokenizerFamily, string[]> = {
  WordPiece: ['[CLS]', '[SEP]', '[MASK]', '[PAD]', '[UNK]'],
  SentencePiece: ['<s>', '</s>', '<unk>', '<pad>'],
  ByteBPE: ['<|endoftext|>', '<|pad|>'],
  Tiktoken: ['<|endoftext|>'],
  Unspecified: []
}

const DEFAULT_UNK: Record<TokenizerFamily, string> = {
  WordPiece: '[UNK]',
  SentencePiece: '<unk>',
  ByteBPE: '<unk>',
  Tiktoken: 'n/a',
  Unspecified: 'n/a'
}

function resolveSource(model: ModelInfo): string {
  if (model.implementation === 'tiktoken') return 'tiktoken'
  return 'transformers.js'
}

function signatureString(parts: (string | number | null | undefined)[]): string {
  return parts
    .map((value) => {
      if (value === null || value === undefined) return '∅'
      if (Array.isArray(value)) return value.join('‖')
      return String(value)
    })
    .join('║')
}

export function buildTokenizerSignature(model: ModelInfo): TokenizerSignature {
  const family = model.family ?? 'Unspecified'
  const vocabSize = typeof model.vocabSize === 'number' ? model.vocabSize : null
  const normalization = model.implementation === 'tiktoken' ? 'NFC' : 'Model default'
  const source = resolveSource(model)
  const unkToken = DEFAULT_UNK[family as TokenizerFamily] ?? 'n/a'
  const specialTokens = DEFAULT_SPECIAL_TOKENS[family as TokenizerFamily] ?? []
  const mergesSample = model.implementation === 'tiktoken' ? 'n/a' : null

  const signatureKey = signatureString([
    family,
    vocabSize,
    unkToken,
    specialTokens.join(','),
    normalization,
    source,
    mergesSample ?? '∅'
  ])

  return {
    tokenizerId: model.id,
    family,
    vocabSize,
    unkToken,
    specialTokens,
    normalization,
    source,
    mergesSample,
    signatureKey
  }
}

export function buildTokenizerSignatures(models: ModelInfo[]): TokenizerSignature[] {
  return models.map(buildTokenizerSignature)
}

