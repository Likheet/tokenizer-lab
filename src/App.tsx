import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Download, Eye, EyeOff, Loader2, Sparkles, ChevronsUpDown, Square, GitCompare, ListTree } from 'lucide-react'

import { Button } from './components/ui/button'
import { Badge } from './components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'
import { ScrollArea } from './components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from './components/ui/table'
// Tabs removed from UI; keeping import commented if needed later
// import { Tabs, TabsContent } from './components/ui/tabs'
import { cn } from './lib/utils'
import { SegmentGroup } from './components/ui/segment-group'
import { Textarea } from './components/ui/textarea'
import {
  AVAILABLE_MODELS,
  getHfTokenId,
  tokenizeOnce,
  type ModelCategory,
  type ModelInfo,
  type TokenizationResult
} from './tokenizers'
import {
  COMPARISON_REPOS,
  STARTER_DATASET,
  compareAll,
  downloadCSV,
  runBatch,
  summarize,
  toCSV,
  type Row
} from './compare'

const TokenBackground = lazy(() => import('./components/background/TokenBackground'))

type Mode = 'single' | 'compare' | 'batch'
type TokenView = 'human' | 'raw' | 'ids' | 'offsets'

const MODE_META: Record<Mode, { title: string; description: string; short: string }> = {
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
  }
}

// Segmented control replaced with custom SegmentGroup implementation

const TOKEN_VIEW_OPTIONS: { value: TokenView; label: string }[] = [
  { value: 'human', label: 'Readable slices' },
  { value: 'raw', label: 'Model tokens' },
  { value: 'ids', label: 'Token IDs' },
  { value: 'offsets', label: 'Offsets' }
]

const CATEGORY_LABELS: Record<ModelCategory, string> = {
  basic: 'General purpose',
  indian: 'Indic language specialists',
  frontier: 'Frontier and production stacks'
}

const METRIC_FIELDS: {
  key: keyof TokenizationResult['metrics']
  label: string
  format?: (value: number) => string
}[] = [
  { key: 'tokenCount', label: 'Tokens' },
  { key: 'charCount', label: 'Characters' },
  { key: 'byteCount', label: 'Bytes' },
  { key: 'tokensPer100Chars', label: 'Tokens / 100 chars', format: (v) => v.toFixed(2) },
  { key: 'bytesPerToken', label: 'Bytes / token', format: (v) => v.toFixed(2) },
  { key: 'avgTokenLength', label: 'Avg. token length', format: (v) => v.toFixed(2) },
  {
    key: 'unkPercentage',
    label: 'UNK %',
    format: (v) => `${v.toFixed(2)}%`
  }
]

export default function App() {
  const [text, setText] = useState('आज धूप नहीं निकली है — aaj dhoop nahi nikli hai.')
  const [batchText, setBatchText] = useState(STARTER_DATASET)
  const [selectedModel, setSelectedModel] = useState('Xenova/bert-base-multilingual-uncased')
  const [mode, setMode] = useState<Mode>('single')
  const [result, setResult] = useState<TokenizationResult | null>(null)
  const [compareResults, setCompareResults] = useState<(TokenizationResult & { repo: string })[]>([])
  const [batchResults, setBatchResults] = useState<Row[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [tokenView, setTokenView] = useState<TokenView>('human')
  const [hfToken, setHfToken] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      return window.localStorage?.getItem('hf_token') ?? ''
    } catch {
      return ''
    }
  })
  const [showToken, setShowToken] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelMenuHighlight, setModelMenuHighlight] = useState<string | null>(null)
  const modelButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const flatModelIds = useMemo(() => AVAILABLE_MODELS.map((model) => model.id), [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const trimmed = hfToken.trim()
      if (trimmed) {
        window.localStorage.setItem('hf_token', trimmed)
      } else {
        window.localStorage.removeItem('hf_token')
      }
    } catch (error) {
      console.warn('Unable to persist HF token:', error)
    }
  }, [hfToken])

  useEffect(() => {
    if (!modelMenuOpen) {
      setModelMenuHighlight(null)
      return
    }
    const currentId = selectedModel
    setModelMenuHighlight(currentId)
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        modelButtonRefs.current[currentId]?.focus()
      })
    }
  }, [modelMenuOpen, selectedModel])

  const modelLookup = useMemo(() => {
    return AVAILABLE_MODELS.reduce<Record<string, ModelInfo>>((acc, model) => {
      acc[model.id] = model
      return acc
    }, {})
  }, [])

  const modelsByCategory = useMemo(() => {
    return AVAILABLE_MODELS.reduce<Record<ModelCategory, ModelInfo[]>>(
      (acc, model) => {
        acc[model.category] = acc[model.category] ?? []
        acc[model.category]!.push(model)
        return acc
      },
      { basic: [], indian: [], frontier: [] }
    )
  }, [])

  const selectedModelInfo = modelLookup[selectedModel]

  function selectModel(modelId: string) {
    setSelectedModel(modelId)
    setModelMenuOpen(false)
  }

  function focusModel(modelId: string) {
    setModelMenuHighlight(modelId)
    const node = modelButtonRefs.current[modelId]
    if (node) {
      node.focus()
      node.scrollIntoView({ block: 'nearest' })
    }
  }

  function handleModelKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentId: string) {
    const currentIndex = flatModelIds.indexOf(currentId)
    if (currentIndex === -1) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      const nextIndex = (currentIndex + 1) % flatModelIds.length
      focusModel(flatModelIds[nextIndex])
      return
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      const prevIndex = (currentIndex - 1 + flatModelIds.length) % flatModelIds.length
      focusModel(flatModelIds[prevIndex])
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      focusModel(flatModelIds[0])
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      focusModel(flatModelIds[flatModelIds.length - 1])
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      selectModel(currentId)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setModelMenuOpen(false)
      return
    }
  }

  async function runSingle() {
    setErr(null)
    setResult(null)
    setLoading(true)
    try {
      const tokenizationResult = await tokenizeOnce(selectedModel, text)
      setResult(tokenizationResult)
    } catch (e: any) {
      setErr(e?.message || 'Tokenization failed')
    } finally {
      setLoading(false)
    }
  }

  async function runCompare() {
    setErr(null)
    setCompareResults([])
    setCompareLoading(true)
    try {
      const results = await compareAll(text)
      setCompareResults(results)
    } catch (e: any) {
      setErr(e?.message || 'Comparison failed')
    } finally {
      setCompareLoading(false)
    }
  }

  async function runBatchAnalysis() {
    setErr(null)
    setBatchResults([])
    setBatchLoading(true)
    try {
      const lines = batchText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) {
        throw new Error('Add at least one non-empty line before running a batch analysis.')
      }
      const results = await runBatch(COMPARISON_REPOS, lines)
      setBatchResults(results)
    } catch (e: any) {
      setErr(e?.message || 'Batch analysis failed')
    } finally {
      setBatchLoading(false)
    }
  }

  function exportToCSV() {
    if (batchResults.length === 0) return
    const csv = toCSV(batchResults)
    downloadCSV('tokenizer-lab-batch.csv', csv)
  }

  const batchSummary = useMemo(() => (batchResults.length ? summarize(batchResults) : []), [batchResults])

  return (
    <div className="relative min-h-screen bg-background pb-24">
      {/* 3D Background Layer */}
      <div className="fixed inset-0 -z-40">
        <Suspense
          fallback={
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.22),transparent_60%),radial-gradient(circle_at_70%_35%,rgba(14,165,233,0.18),transparent_60%)]" />
          }
        >
          <TokenBackground />
        </Suspense>
      </div>
      {/* Gradient & darkening overlays above the canvas */}
      <div className="pointer-events-none absolute inset-0 -z-30 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="absolute inset-x-0 top-0 -z-20 h-[520px] bg-gradient-to-b from-background/20 via-background/70 to-background" />
      <div className="absolute inset-0 -z-10 backdrop-blur-[2px]" />

      <header className="border-b border-border/60 bg-background/60 backdrop-blur">
        <div className="container flex flex-col gap-6 py-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-4">
            <Badge variant="secondary" className="w-max gap-2 bg-secondary/60 text-secondary-foreground">
              <Sparkles className="h-4 w-4" />
              Tokenizer Lab
            </Badge>
            <div className="space-y-2">
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Multilingual tokenization workbench
              </h1>
              <p className="max-w-2xl text-base text-muted-foreground">
                Explore how cutting-edge tokenizers behave on Indic and multilingual samples. Track metrics,
                compare models, and export structured results in seconds.
              </p>
            </div>
            {selectedModelInfo ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <Badge variant="outline" className="bg-background/60">
                  {CATEGORY_LABELS[selectedModelInfo.category]}
                </Badge>
                <span>
                  <span className="font-semibold text-foreground">{selectedModelInfo.name}</span>
                  {selectedModelInfo.shortName && (
                    <span className="text-muted-foreground"> · {selectedModelInfo.shortName}</span>
                  )}
                </span>
              </div>
            ) : null}
          </div>

          <Card className="max-w-sm bg-card/70 shadow-lg shadow-primary/10">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Hugging Face access token</CardTitle>
              <CardDescription>
                Stored locally in your browser. Required for gated models like Meta Llama 3 and Mistral.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="hf-token" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Access token
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="hf-token"
                    type={showToken ? 'text' : 'password'}
                    value={hfToken}
                    onChange={(event) => setHfToken(event.target.value)}
                    placeholder="hf_..."
                    className="bg-background/80"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setShowToken((s) => !s)}
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Need one? Visit{' '}
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary"
                >
                  huggingface.co/settings/tokens
                </a>{' '}
                and create a <strong>read</strong>-only token. Currently cached token ID: {getHfTokenId() || '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      </header>

      <main className="container space-y-8 py-10">
        <Card className="border border-border/70 bg-card/70 shadow-xl shadow-primary/5">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-1.5">
                <CardTitle className="text-xl">Workspace</CardTitle>
                <CardDescription className="text-sm">Select a model & switch modes. Smooth animated slider below.</CardDescription>
              </div>
              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <SegmentGroup.Root value={mode} onValueChange={(e) => setMode(e.value as Mode)} size="md" className="min-w-[260px]">
                  <SegmentGroup.Indicator />
                  <SegmentGroup.Items items={[
                    {
                      value: 'single',
                      label: (
                        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <Square className="h-3.5 w-3.5" /> Single
                        </span>
                      )
                    },
                    {
                      value: 'compare',
                      label: (
                        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <GitCompare className="h-3.5 w-3.5" /> Compare
                        </span>
                      )
                    },
                    {
                      value: 'batch',
                      label: (
                        <span className="flex items-center gap-1.5 text-xs uppercase tracking-wide">
                          <ListTree className="h-3.5 w-3.5" /> Batch
                        </span>
                      )
                    }
                  ]} />
                </SegmentGroup.Root>
                <div className="relative">
                  <button
                    onClick={() => setModelMenuOpen(o => !o)}
                    className="flex w-[260px] items-center justify-between rounded-md border border-border/60 bg-background/70 px-3 py-2 text-left text-sm font-medium shadow-sm hover:bg-background/90"
                    aria-expanded={modelMenuOpen}
                  >
                    <span className="truncate">{selectedModelInfo?.name || 'Select tokenizer'}</span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 opacity-60" />
                  </button>
                  {modelMenuOpen && (
                    <div
                      className="absolute z-50 mt-2 max-h-[340px] w-[320px] overflow-auto overscroll-contain rounded-lg border border-border/60 bg-popover p-2 shadow-xl scrollbar-hidden"
                      role="menu"
                      aria-label="Tokenizer models"
                      aria-orientation="vertical"
                      aria-activedescendant={
                        modelMenuHighlight
                          ? `model-option-${modelMenuHighlight.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                          : undefined
                      }
                    >
                      <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        <span>Tokenizers</span>
                      </div>
                      <div className="space-y-4 pr-1">
                        {(Object.entries(modelsByCategory) as [ModelCategory, ModelInfo[]][]).map(([cat, models]) => (
                          <div key={cat} className="space-y-1">
                            <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">{CATEGORY_LABELS[cat]}</p>
                            <ul className="grid gap-1">
                              {models.map((model) => {
                                const buttonId = `model-option-${model.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                                const isSelected = selectedModel === model.id
                                const isHighlighted = modelMenuHighlight === model.id && !isSelected
                                return (
                                  <li key={model.id}>
                                    <button
                                      id={buttonId}
                                      ref={(node) => {
                                        modelButtonRefs.current[model.id] = node
                                      }}
                                      role="menuitemradio"
                                      aria-checked={isSelected}
                                      tabIndex={isSelected ? 0 : -1}
                                      onClick={() => selectModel(model.id)}
                                      onKeyDown={(event) => handleModelKeyDown(event, model.id)}
                                      onMouseEnter={() => setModelMenuHighlight(model.id)}
                                      onFocus={() => setModelMenuHighlight(model.id)}
                                      className={cn(
                                        'flex w-full flex-col rounded-md px-2 py-1.5 text-left text-xs transition outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
                                        isSelected
                                          ? 'bg-primary text-primary-foreground shadow-sm ring-1 ring-primary/60'
                                          : 'text-foreground/90 hover:bg-muted/70',
                                        isHighlighted && 'bg-muted/60 ring-1 ring-border/60'
                                      )}
                                    >
                                      <span className="block truncate font-medium">{model.name}</span>
                                      <span className="block truncate text-[10px] text-muted-foreground">{model.id}</span>
                                    </button>
                                  </li>
                                )
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardFooter className="pt-0">
            {selectedModelInfo?.category === 'indian' && (
              <div className="flex items-center gap-2 rounded-md border border-border/60 bg-secondary/30 px-3 py-2 text-xs text-secondary-foreground">
                <Sparkles className="h-3.5 w-3.5" /> Indic-optimized tokenizer.
              </div>
            )}
          </CardFooter>
        </Card>

        <Card className="bg-card/80 shadow-2xl shadow-primary/10">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-lg leading-tight">{MODE_META[mode].title}</CardTitle>
                <CardDescription>{MODE_META[mode].description}</CardDescription>
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground">Mode: {MODE_META[mode].short}</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {mode === 'single' && (
              <div className="space-y-4">
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Paste or type the text you want to tokenize…"
                  className="min-h-[140px] bg-background/70"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runSingle} disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Tokenize sample
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tokens are rendered with visible whitespace markers so you can track segmentation precisely.
                  </p>
                </div>
              </div>
            )}
            {mode === 'compare' && (
              <div className="space-y-4">
                <Textarea
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  placeholder="Single snippet to compare across all tokenizers"
                  className="min-h-[140px] bg-background/70"
                />
                <Button onClick={runCompare} disabled={compareLoading}>
                  {compareLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Compare every tokenizer
                </Button>
              </div>
            )}
            {mode === 'batch' && (
              <div className="space-y-4">
                <Textarea
                  value={batchText}
                  onChange={(event) => setBatchText(event.target.value)}
                  placeholder="One sample per line—mix Indic scripts, emoji and URLs to stress-test tokenizers."
                  className="min-h-[220px] bg-background/70"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runBatchAnalysis} disabled={batchLoading}>
                    {batchLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Run batch analysis
                  </Button>
                  {batchResults.length > 0 && (
                    <Button type="button" variant="outline" onClick={exportToCSV}>
                      <Download className="mr-2 h-4 w-4" /> Export CSV
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Batch mode runs every snippet against each tokenizer. Results stream back immediately once
                    ready.
                  </p>
                </div>
              </div>
            )}

            {err ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {err}
              </div>
            ) : null}

            {result && mode === 'single' ? (
              <SingleResultView
                result={result}
                tokenView={tokenView}
                onTokenViewChange={setTokenView}
              />
            ) : null}

            {compareResults.length > 0 && mode === 'compare' ? (
              <CompareResultsView results={compareResults} />
            ) : null}

            {batchResults.length > 0 && mode === 'batch' ? (
              <BatchResultsView rows={batchResults} summary={batchSummary} onExport={exportToCSV} />
            ) : null}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

interface SingleResultViewProps {
  result: TokenizationResult
  tokenView: TokenView
  onTokenViewChange: (view: TokenView) => void
}

function SingleResultView({ result, tokenView, onTokenViewChange }: SingleResultViewProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-[340px,1fr]">
      <Card className="h-full bg-card/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg">Tokenization metrics</CardTitle>
          <CardDescription>High-level stats for the current tokenizer run.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {METRIC_FIELDS.map(({ key, label, format }) => {
            const value = result.metrics[key]
            const formatted = typeof value === 'number' ? (format ? format(value) : value.toString()) : '—'
            const isDestructive = key === 'unkPercentage' && value > 0
            return (
              <div
                key={key}
                className="flex items-center justify-between rounded-lg border border-border/60 bg-background/60 px-3 py-2 text-sm"
              >
                <span className="text-muted-foreground">{label}</span>
                <span className={cn('tabular-nums font-medium', isDestructive ? 'text-destructive' : 'text-foreground')}>
                  {formatted}
                </span>
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-lg">Token explorer</CardTitle>
            <CardDescription>Switch views to inspect IDs, source offsets, or raw model tokens.</CardDescription>
          </div>
          <Select value={tokenView} onValueChange={(value) => onTokenViewChange(value as TokenView)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {TOKEN_VIEW_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] w-full rounded-lg border border-border/60 bg-background/70">
            <div className="flex flex-wrap gap-2 p-4">
              {result.tokens.map((token, index) => {
                const id = result.ids[index]
                const raw = result.tokenStrings?.[index]
                const offsets = result.offsets?.[index]
                let display = token

                if (tokenView === 'raw') {
                  display = raw ?? String(id)
                } else if (tokenView === 'ids') {
                  display = String(id)
                } else if (tokenView === 'offsets') {
                  const label = offsets ? `${offsets[0]}-${offsets[1]}` : '—'
                  display = `${token}  [${label}]`
                }

                const isUnk = raw === '[UNK]' || token.includes('[UNK]')
                const title: string[] = [`ID: ${id}`]
                if (raw) title.push(`raw: ${raw}`)
                if (offsets) title.push(`offset: ${offsets[0]}-${offsets[1]}`)

                return (
                  <Badge
                    key={`${token}-${index}`}
                    variant={isUnk ? 'destructive' : 'outline'}
                    className="cursor-default whitespace-pre bg-background/70 px-2.5 py-1 font-mono text-[11px] tracking-tight shadow-sm ring-1 ring-inset ring-border/40 hover:ring-border/60 transition"
                    title={title.join(' | ')}
                  >
                    {display}
                  </Badge>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}

interface CompareResultsViewProps {
  results: (TokenizationResult & { repo: string })[]
}

function CompareResultsView({ results }: CompareResultsViewProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">Side-by-side comparison</h3>
        <p className="text-sm text-muted-foreground">
          Metrics and token streams for every tokenizer are displayed below. Hover a token chip to inspect IDs and
          offsets.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => {
          const modelInfo = AVAILABLE_MODELS.find((model) => model.id === result.repo)
          return (
            <Card key={result.repo} className="bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{modelInfo?.shortName ?? result.repo.split('/')[1]}</span>
                  <Badge variant="outline" className="text-xs">
                    {modelInfo?.category ? CATEGORY_LABELS[modelInfo.category] : 'Tokenizer'}
                  </Badge>
                </CardTitle>
                <CardDescription>{modelInfo?.name ?? result.repo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  <MetricRow label="Tokens" value={result.metrics.tokenCount} />
                  <MetricRow label="Tokens / 100" value={result.metrics.tokensPer100Chars.toFixed(2)} />
                  <MetricRow label="Bytes / token" value={result.metrics.bytesPerToken.toFixed(2)} />
                  <MetricRow
                    label="UNK %"
                    value={`${result.metrics.unkPercentage.toFixed(2)}%`}
                    highlight={result.metrics.unkPercentage > 0}
                  />
                </div>
                <ScrollArea className="h-[180px] w-full rounded-md border border-border/60 bg-background/70">
                  <div className="flex flex-wrap gap-2 p-3">
                    {result.tokens.map((token, index) => {
                      const raw = result.tokenStrings?.[index]
                      const isUnk = raw === '[UNK]' || token.includes('[UNK]')
                      const id = result.ids[index]
                      return (
                        <Badge
                          key={`${result.repo}-${index}`}
                          variant={isUnk ? 'destructive' : 'outline'}
                          className="cursor-default whitespace-pre bg-background/70 px-2.5 py-1 font-mono text-[10px] tracking-tight shadow-sm ring-1 ring-inset ring-border/40 hover:ring-border/60 transition"
                          title={`ID: ${id}${raw ? ` | raw: ${raw}` : ''}`}
                        >
                          {token}
                        </Badge>
                      )
                    })}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

interface BatchResultsViewProps {
  rows: Row[]
  summary: ReturnType<typeof summarize>
  onExport: () => void
}

function BatchResultsView({ rows, summary, onExport }: BatchResultsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">Batch results</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} tokenizer×snippet combinations. Scroll to inspect everything or export the CSV snapshot.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      <ScrollArea className="h-[360px] w-full rounded-lg border border-border/60 bg-background/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Slice</TableHead>
              <TableHead className="w-[90px]">Tokens</TableHead>
              <TableHead className="w-[120px]">Tokens / 100</TableHead>
              <TableHead className="w-[120px]">Bytes / token</TableHead>
              <TableHead className="w-[90px]">UNK %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={`${row.repo}-${index}`}>
                <TableCell className="font-medium text-foreground">{row.repo.split('/')[1]}</TableCell>
                <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                  {row.text}
                </TableCell>
                <TableCell className="tabular-nums font-medium">{row.tokens}</TableCell>
                <TableCell className="tabular-nums font-medium">{row.tokens_per_100_chars.toFixed(2)}</TableCell>
                <TableCell className="tabular-nums font-medium">{row.bytes_per_token.toFixed(2)}</TableCell>
                <TableCell className={cn('tabular-nums font-medium', row.unk_rate > 0 && 'text-destructive')}>
                  {row.unk_rate.toFixed(2)}%
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollArea>

      {summary.length > 0 && (
        <Card className="bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Slice-level summary</CardTitle>
            <CardDescription>
              Average metrics grouped by inferred language slice. Handy for spotting regressions on a segment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {summary.map((item) => (
                <div key={`${item.repo}-${item.slice}`} className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <div className="flex items-baseline justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{item.repo.split('/')[1]}</h4>
                    <Badge variant="outline" className="text-xs uppercase tracking-wide">
                      {item.slice}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <SummaryMetric label="Mean tokens" value={item.mean_tokens.toFixed(1)} />
                    <SummaryMetric label="Tokens / 100" value={item.mean_tokens_per_100.toFixed(2)} />
                    <SummaryMetric label="Bytes / token" value={item.mean_bytes_per_token.toFixed(2)} />
                    <SummaryMetric
                      label="UNK %"
                      value={`${item.mean_unk.toFixed(2)}%`}
                      highlight={item.mean_unk > 0}
                    />
                  </dl>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

interface MetricRowProps {
  label: string
  value: string | number
  highlight?: boolean
}

function MetricRow({ label, value, highlight }: MetricRowProps) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('tabular-nums font-medium', highlight ? 'text-destructive' : 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

interface SummaryMetricProps {
  label: string
  value: string
  highlight?: boolean
}

function SummaryMetric({ label, value, highlight }: SummaryMetricProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-destructive' : 'font-semibold text-foreground'}>
        {value}
      </span>
    </div>
  )
}
