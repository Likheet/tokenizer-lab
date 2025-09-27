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
  getHfTokenId,
  tokenizeOnce,
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

export default function App() {
  const [text, setText] = useState('?? ??? ???? ????? ?? - aaj dhoop nahi nikli hai.')
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

  const modelLookup = useMemo<Record<string, ModelInfo>>(() => {
    return AVAILABLE_MODELS.reduce((acc, model) => {
      acc[model.id] = model
      return acc
    }, {} as Record<string, ModelInfo>)
  }, [])
  const selectedModelInfo = modelLookup[selectedModel]
  const batchSummary = useMemo(() => (batchResults.length ? summarize(batchResults) : []), [batchResults])

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
    setCompareLoading(true)
    try {
      const results = await compareAll(text)
      setCompareResults(results)
    } catch (error: any) {
      setErr(error?.message || 'Comparison failed')
    } finally {
      setCompareLoading(false)
    }
  }, [text])

  const runBatchAnalysis = useCallback(async () => {
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
    } catch (error: any) {
      setErr(error?.message || 'Batch analysis failed')
    } finally {
      setBatchLoading(false)
    }
  }, [batchText])

  const exportToCSV = useCallback(() => {
    if (!batchResults.length) return
    const csv = toCSV(batchResults)
    downloadCSV('tokenizer-lab-batch.csv', csv)
  }, [batchResults])

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
                      <Download className="mr-2 h-4 w-4" /> Export CSV
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
          <div className="space-y-5">
            <Badge variant="secondary" className="w-max gap-2.5 px-3 py-1.5 bg-secondary/60 text-secondary-foreground">
              <Sparkles className="h-4.5 w-4.5" />
              Tokenizer Lab
            </Badge>
            <div className="space-y-2">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
                Multilingual tokenization workbench
              </h2>
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
                    <span className="text-muted-foreground"> - {selectedModelInfo.shortName}</span>
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
