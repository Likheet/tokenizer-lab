export const PUBLICATION_TOKENIZERS = [
  'Xenova/bert-base-multilingual-uncased',
  'Xenova/t5-small',
  'Xenova/xlm-roberta-base',
  'Xenova/bert-base-uncased',
  'Xenova/distilgpt2',
  'ai4bharat/IndicBERTv2-MLM-only',
  'InvincibleSloth/muril-tokenizer',
  'openai/tiktoken/cl100k_base',
  'openai/tiktoken/o200k_base',
  'meta-llama/Meta-Llama-3.1-8B-Instruct',
  'mistralai/Mistral-7B-Instruct-v0.3'
] as const

export type PublicationTokenizerId = (typeof PUBLICATION_TOKENIZERS)[number]
