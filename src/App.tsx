import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'

import { ModeToggle } from './components/ui/theme-toggle'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from './components/ui/card'
import { Input } from './components/ui/input'
import { Label } from './components/ui/label'
import { Textarea } from './components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './components/ui/select'
import { ToggleGroup, ToggleGroupItem } from './components/ui/toggle-group'
import {
  MODE_META,
  CATEGORY_LABELS,
  type Mode,
  type TokenView
} from './features/workbench/constants'
import { ModeToolbar } from './features/workbench/ModeToolbar'
import { SampleControls } from './features/workbench/SampleControls'
import { SingleResultView } from './features/workbench/SingleResultView'
import { CompareResultsView } from './features/workbench/CompareResultsView'
import { BatchResultsView } from './features/workbench/BatchResultsView'
import {
  generateSample,
  type SampleLanguage,
  type SampleLength
} from './features/workbench/sampleData'
import {
  AVAILABLE_MODELS,
  TIKTOKEN_VERSION,
  TRANSFORMERS_JS_VERSION,
  getHfTokenId,
  tokenizeOnce,
  type ModelInfo,
  type TokenizationResult
} from './tokenizers'
import {
  PINNED_COMPARISON_IDS,
  STARTER_DATASET,
  compareAll,
  downloadCSV,
  runBatch,
  summarize,
  summaryToCSV,
  tagSlice,
  toCSV,
  type Row,
  type Slice
} from './compare'

const LOCAL_STORAGE_KEYS = {
  compareSelection: 'tokenizer_lab_compare_selection'
}

const PINNED_DEFAULT_SELECTION = Array.from(PINNED_COMPARISON_IDS)
const PINNED_SET = new Set<string>(PINNED_DEFAULT_SELECTION)
const AVAILABLE_MODEL_IDS = new Set<string>(AVAILABLE_MODELS.map((model) => model.id))

type BatchSliceSelection = 'auto' | Slice

const SLICE_OPTIONS: { value: BatchSliceSelection; label: string }[] = [
  { value: 'auto', label: 'Auto-detect (preview only)' },
  { value: 'Hindi', label: 'Hindi' },
  { value: 'Hinglish', label: 'Hinglish' },
  { value: 'Kannada', label: 'Kannada' },
  { value: 'English', label: 'English' },
  { value: 'Mixed', label: 'Mixed' },
  { value: 'Tamil', label: 'Tamil' }
]

const APP_VERSION_DISPLAY = import.meta.env.VITE_APP_VERSION ?? 'dev'
const GIT_COMMIT = import.meta.env.VITE_GIT_COMMIT ?? 'unknown'
const BUILD_TIME = import.meta.env.VITE_BUILD_TIME ?? ''

type AboutItem = { label: string; value: string; title?: string }

const COMMIT_SHORT = GIT_COMMIT === 'unknown' ? 'unknown' : GIT_COMMIT.slice(0, 7)
const BUILD_TIME_DISPLAY = BUILD_TIME || 'runtime'

const ABOUT_ITEMS: AboutItem[] = [
  { label: 'App version', value: APP_VERSION_DISPLAY },
  { label: 'Commit', value: COMMIT_SHORT, title: GIT_COMMIT },
  { label: 'Build time', value: BUILD_TIME_DISPLAY },
  { label: 'Transformers.js', value: TRANSFORMERS_JS_VERSION },
  { label: 'tiktoken', value: TIKTOKEN_VERSION }
]

const TokenBackground = lazy(() => import('./components/background/TokenBackground'))

export default function App() {
  const [text, setText] = useState('?? ??? ???? ????? ?? - aaj dhoop nahi nikli hai.')
  const [batchText, setBatchText] = useState(STARTER_DATASET)
  const [selectedModel, setSelectedModel] = useState('Xenova/bert-base-multilingual-uncased')
  const [mode, setMode] = useState<Mode>('single')
  const [result, setResult] = useState<TokenizationResult | null>(null)
  const [compareResults, setCompareResults] = useState<(TokenizationResult & { repo: string; display_name?: string })[]>([])
  const [batchResults, setBatchResults] = useState<Row[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>(() => {
    if (typeof window === 'undefined') {
      return [...PINNED_DEFAULT_SELECTION]
    }
    try {
      const stored = window.localStorage?.getItem(LOCAL_STORAGE_KEYS.compareSelection)
      if (stored) {
        const parsed = JSON.parse(stored)
        if (Array.isArray(parsed)) {
          const filtered = parsed.filter((id: unknown): id is string => typeof id === 'string' && AVAILABLE_MODEL_IDS.has(id))
          if (filtered.length) {
            return filtered
          }
        }
      }
    } catch (error) {
      console.warn('Unable to restore tokenizer selection:', error)
    }
    return [...PINNED_DEFAULT_SELECTION]
  })
  const [batchSlice, setBatchSlice] = useState<BatchSliceSelection>('auto')
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [batchLoading, setBatchLoading] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [sampleLength, setSampleLength] = useState<SampleLength>('small')
  const [sampleIncludeEmojis, setSampleIncludeEmojis] = useState(false)
  const [lastSampleByTarget, setLastSampleByTarget] = useState<Record<Mode, SampleLanguage | null>>({
    single: null,
    compare: null,
    batch: null
  })
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

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(LOCAL_STORAGE_KEYS.compareSelection, JSON.stringify(selectedRepos))
    } catch (error) {
      console.warn('Unable to persist tokenizer selection:', error)
    }
  }, [selectedRepos])

  const modelLookup = useMemo<Record<string, ModelInfo>>(() => {
    return AVAILABLE_MODELS.reduce((acc, model) => {
      acc[model.id] = model
      return acc
    }, {} as Record<string, ModelInfo>)
  }, [])
  const selectionModels = useMemo<ModelInfo[]>(() => {
    return AVAILABLE_MODELS.filter((model) => Boolean(modelLookup[model.id]))
  }, [modelLookup])
  const selectedModelInfo = modelLookup[selectedModel]
  const batchSummary = useMemo(() => (batchResults.length ? summarize(batchResults) : []), [batchResults])
  const autoSlicePreview = useMemo(() => {
    const lines = batchText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (!lines.length) return null
    const counts = new Map<Slice, number>()
    for (const line of lines) {
      const detected = tagSlice(line)
      counts.set(detected, (counts.get(detected) ?? 0) + 1)
    }
    const breakdown = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
    return { total: lines.length, breakdown }
  }, [batchText])
  const autoSlicePreviewLabel = useMemo(() => {
    if (!autoSlicePreview) return ''
    return autoSlicePreview.breakdown
      .slice(0, 3)
      .map(([slice, count]) => `${slice} x${count}`)
      .join(' · ')
  }, [autoSlicePreview])

  const handleSelectionChange = useCallback((values: string[]) => {
    if (!values.length) {
      setSelectedRepos([])
      return
    }
    const filtered = values.filter((id) => AVAILABLE_MODEL_IDS.has(id))
    setSelectedRepos(filtered)
  }, [])

  const handleSampleInsert = useCallback(
    (language: SampleLanguage, target: Mode, length?: SampleLength) => {
      const variant = target === 'batch' ? 'batch' : 'single'
      const effectiveLength = length ?? sampleLength
      const sample = generateSample(language, variant, effectiveLength, sampleIncludeEmojis)
      if (target === 'batch') {
        setBatchText(sample)
      } else {
        setText(sample)
      }
      setLastSampleByTarget((prev) => ({ ...prev, [target]: language }))
    },
    [sampleIncludeEmojis, sampleLength]
  )

  const handleSampleLengthChange = useCallback(
    (target: Mode, nextLength: SampleLength) => {
      setSampleLength(nextLength)
      const lastLanguage = lastSampleByTarget[target]
      if (lastLanguage) {
        handleSampleInsert(lastLanguage, target, nextLength)
      }
    },
    [handleSampleInsert, lastSampleByTarget]
  )

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

  const selectModel = useCallback((modelId: string) => {
    setSelectedModel(modelId)
  }, [])

  const runSingle = useCallback(async () => {
    setErr(null)
    setResult(null)
    setLoading(true)
    try {
      const tokenizationResult = await tokenizeOnce(selectedModel, text)
      setResult(tokenizationResult)
    } catch (error: any) {
      setErr(error?.message || 'Tokenization failed')
    } finally {
      setLoading(false)
    }
  }, [selectedModel, text])

  const runCompare = useCallback(async () => {
    setErr(null)
    setCompareResults([])
    if (!selectedRepos.length) {
      setErr('Select at least one tokenizer to compare.')
      return
    }
    setCompareLoading(true)
    try {
      const results = await compareAll(text, selectedRepos)
      setCompareResults(results)
    } catch (error: any) {
      setErr(error?.message || 'Comparison failed')
    } finally {
      setCompareLoading(false)
    }
  }, [selectedRepos, text])

  const runBatchAnalysis = useCallback(async () => {
    setErr(null)
    setBatchResults([])
    if (!selectedRepos.length) {
      setErr('Select at least one tokenizer for batch analysis.')
      return
    }
    setBatchLoading(true)
    try {
      const lines = batchText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
      if (!lines.length) {
        throw new Error('Add at least one non-empty line before running a batch analysis.')
      }
      const results = await runBatch(selectedRepos, lines, {
        slice: batchSlice === 'auto' ? undefined : batchSlice
      })
      setBatchResults(results)
    } catch (error: any) {
      setErr(error?.message || 'Batch analysis failed')
    } finally {
      setBatchLoading(false)
    }
  }, [batchSlice, batchText, selectedRepos])

  const exportToCSV = useCallback(() => {
    if (!batchResults.length) return
    
    // Generate timestamp for filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    
    // Export detailed results with full provenance
    const detailedCSV = toCSV(batchResults)
    downloadCSV(`tokenizer-lab-detailed-${timestamp}.csv`, detailedCSV)
    
    // Export summary with statistics if we have summary data
    if (batchSummary.length > 0) {
      const summaryCSV = summaryToCSV(batchSummary)
      downloadCSV(`tokenizer-lab-summary-${timestamp}.csv`, summaryCSV)
    }
  }, [batchResults, batchSummary])

  return (
    <div className="relative min-h-screen bg-background pb-24">
      <div className="fixed inset-0 -z-40">
        <Suspense
          fallback={
            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.22),transparent_60%),radial-gradient(circle_at_70%_35%,rgba(14,165,233,0.18),transparent_60%)]" />
          }
        >
          <TokenBackground />
        </Suspense>
      </div>
      <div className="pointer-events-none absolute inset-0 -z-30 bg-[radial-gradient(circle_at_30%_20%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.18),transparent_65%)]" />
      <div className="absolute inset-x-0 top-0 -z-20 h-[520px] bg-gradient-to-b from-background/20 via-background/70 to-background" />
      <div className="absolute inset-0 -z-10 backdrop-blur-[2px]" />

      <div className="absolute right-6 top-6 z-40">
        <ModeToggle />
      </div>

      <main className="container space-y-10 py-12">
        <ModeToolbar
          mode={mode}
          onModeChange={setMode}
          models={AVAILABLE_MODELS}
          selectedModelId={selectedModel}
          onSelectModel={selectModel}
          selectedModelInfo={selectedModelInfo}
        />

        <Card className="bg-card/80 shadow-2xl shadow-primary/10">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-xl leading-tight">{MODE_META[mode].title}</CardTitle>
                <CardDescription className="mt-1">{MODE_META[mode].description}</CardDescription>
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground">Mode: {MODE_META[mode].short}</div>
            </div>
          </CardHeader>
          <CardContent className="space-y-7">
            {(mode === 'compare' || mode === 'batch') && selectionModels.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-background/60 p-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Pinned tokenizers</h3>
                    <p className="text-xs text-muted-foreground">
                      Toggle models to include in compare & batch exports. Defaults are pinned but you can enable any tokenizer below.
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {selectedRepos.length} / {selectionModels.length} selected
                  </span>
                </div>
                <ToggleGroup
                  type="multiple"
                  value={selectedRepos}
                  onValueChange={handleSelectionChange}
                  className="flex flex-wrap gap-2"
                >
                  {selectionModels.map((model) => (
                    <ToggleGroupItem
                      key={model.id}
                      value={model.id}
                      className="flex h-auto min-w-[180px] flex-col items-start gap-1 rounded-md border border-border/60 bg-background/80 px-3 py-2 text-left text-sm shadow-sm transition data-[state=on]:border-primary data-[state=on]:bg-primary/10 data-[state=on]:text-foreground"
                    >
                      <span className="font-semibold leading-tight">
                        {model.shortName || model.name}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{model.id}</span>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {model.implementation === 'tiktoken'
                          ? `tiktoken ${TIKTOKEN_VERSION}`
                          : `transformers.js ${TRANSFORMERS_JS_VERSION}`}
                      </span>
                      {PINNED_SET.has(model.id) ? (
                        <span className="text-[10px] uppercase tracking-wide text-primary/70">Pinned default</span>
                      ) : null}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                {selectedRepos.length === 0 ? (
                  <p className="text-xs font-medium text-destructive">
                    Select at least one tokenizer to run this mode.
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Transformers.js {TRANSFORMERS_JS_VERSION} + @dqbd/tiktoken {TIKTOKEN_VERSION}
                </p>
              </div>
            )}
            {mode === 'single' && (
              <div className="space-y-5">
                <div className="relative">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Paste or type the text you want to tokenize."
                    className="min-h-[160px] bg-background/70 p-4"
                  />
                  <SampleControls
                    target="single"
                    sampleLength={sampleLength}
                    onSampleLengthChange={handleSampleLengthChange}
                    includeEmojis={sampleIncludeEmojis}
                    onIncludeEmojisChange={setSampleIncludeEmojis}
                    onSelectSample={handleSampleInsert}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <Button onClick={runSingle} disabled={loading} className="px-5 py-2.5 h-auto">
                    {loading ? (
                      <>
                        <Loader2 className="mr-2.5 h-4.5 w-4.5 animate-spin" />Generating tokens.
                      </>
                    ) : (
                      'Tokenize sample'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tokens are rendered with visible whitespace markers so you can track segmentation precisely.
                  </p>
                </div>
              </div>
            )}

            {mode === 'compare' && (
              <div className="space-y-4">
                <div className="relative">
                  <Textarea
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    placeholder="Single snippet to compare across all tokenizers"
                    className="min-h-[140px] bg-background/70"
                  />
                  <SampleControls
                    target="compare"
                    sampleLength={sampleLength}
                    onSampleLengthChange={handleSampleLengthChange}
                    includeEmojis={sampleIncludeEmojis}
                    onIncludeEmojisChange={setSampleIncludeEmojis}
                    onSelectSample={handleSampleInsert}
                  />
                </div>
                <Button onClick={runCompare} disabled={compareLoading}>
                  {compareLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />Comparing tokenizers.
                    </>
                  ) : (
                    'Compare every tokenizer'
                  )}
                </Button>
              </div>
            )}

            {mode === 'batch' && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="flex flex-col gap-2">
                    <Label
                      htmlFor="batch-slice"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      Slice override
                    </Label>
                    <Select
                      value={batchSlice}
                      onValueChange={(value) => setBatchSlice(value as BatchSliceSelection)}
                    >
                      <SelectTrigger id="batch-slice" className="w-full bg-background/70 sm:w-[220px]">
                        <SelectValue placeholder="Choose slice" />
                      </SelectTrigger>
                      <SelectContent>
                        {SLICE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Applied to CSV exports. Auto-detect is shown for reference only.
                    </p>
                  </div>
                  {batchSlice === 'auto' && autoSlicePreviewLabel ? (
                    <div className="rounded-md border border-border/50 bg-background/70 px-3 py-2 text-xs text-muted-foreground sm:max-w-[260px]">
                      <span className="font-semibold text-foreground">Auto-detect preview</span>
                      <div className="mt-1">
                        {autoSlicePreviewLabel}
                        {autoSlicePreview ? ` - ${autoSlicePreview.total} lines` : ''}
                      </div>
                    </div>
                  ) : null}
                </div>
                <div className="relative">
                  <Textarea
                    value={batchText}
                    onChange={(event) => setBatchText(event.target.value)}
                    placeholder="One sample per line-mix Indic scripts, emoji and URLs to stress-test tokenizers."
                    className="min-h-[220px] bg-background/70"
                  />
                  <SampleControls
                    target="batch"
                    sampleLength={sampleLength}
                    onSampleLengthChange={handleSampleLengthChange}
                    includeEmojis={sampleIncludeEmojis}
                    onIncludeEmojisChange={setSampleIncludeEmojis}
                    onSelectSample={handleSampleInsert}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={runBatchAnalysis} disabled={batchLoading}>
                    {batchLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />Running batch analysis.
                      </>
                    ) : (
                      'Run batch analysis'
                    )}
                  </Button>
                  {batchResults.length > 0 && (
                    <Button type="button" variant="outline" onClick={exportToCSV}>
                      <Download className="mr-2 h-4 w-4" /> Export CSVs
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Batch mode runs every snippet against each tokenizer. Results stream back immediately once ready.
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
              <CompareResultsView results={compareResults} modelLookup={modelLookup} />
            ) : null}

            {batchResults.length > 0 && mode === 'batch' ? (
              <BatchResultsView rows={batchResults} summary={batchSummary} onExport={exportToCSV} />
            ) : null}
          </CardContent>
        </Card>
      </main>

      <footer className="border-t border-border/60 bg-background/60 backdrop-blur mt-16">
        <div className="container flex flex-col gap-10 py-12 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-5 lg:max-w-lg">
            <div className="space-y-4">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  About this build
                </h2>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {ABOUT_ITEMS.map((item) => (
                  <div key={item.label} className="flex flex-col text-sm">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">{item.label}</span>
                    <span
                      className="font-medium text-foreground"
                      title={item.title ?? item.value}
                    >
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Tokenizer registry</span>
                <div className="space-y-3">
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">General Purpose</h4>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">mBERT</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">T5</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">XLM-RoBERTa</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">BERT</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">DistilGPT-2</Badge>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Indic Languages</h4>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">IndicBERT v2</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">MuRIL</Badge>
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Frontier Models</h4>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">OpenAI CL100K</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">OpenAI O200K</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">Llama 3.1 8B</Badge>
                      <Badge variant="outline" className="text-[10px] px-2 py-0.5 bg-background/60">Mistral 7B</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </div>
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
                    onClick={() => setShowToken((state) => !state)}
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
                and create a <strong>read</strong>-only token. Currently cached token ID: {getHfTokenId() || '-'}
              </p>
            </CardContent>
          </Card>
        </div>
      </footer>
    </div>
  )
}
