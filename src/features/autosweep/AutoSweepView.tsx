import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { AlertTriangle, CheckCircle2, Download, Loader2, Upload, Wand2 } from 'lucide-react'

import { AUTOSWEEP_PRESETS } from '../../autosweep/presets'
import type { AutoSweepCsvRow, SweepAxis, SweepConfig } from '../../autosweep/types'
import type { ModelInfo } from '../../tokenizers'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'

const AXIS_ORDER: SweepAxis[] = ['ascii_ratio', 'emoji_count', 'url_on', 'normalize', 'zwj_on', 'perturbations']

const AXIS_LABEL: Record<SweepAxis, string> = {
  ascii_ratio: 'ASCII ratio',
  emoji_count: 'Emoji count',
  url_on: 'URL flag',
  normalize: 'Normalization',
  zwj_on: 'Insert ZWJ variant',
  perturbations: 'Perturbations'
}

const AXIS_HELP_TEXT: Record<SweepAxis, string> = {
  ascii_ratio: 'Comma separated floats between 0 and 1.',
  emoji_count: 'Comma separated integers representing appended emoji count.',
  url_on: '0 or 1 to control URL injection.',
  normalize: 'Normalization forms such as NFC or NFD.',
  zwj_on: '0 or 1 to insert Zero Width Joiner variants in consonant clusters.',
  perturbations: 'Comma separated integers for random perturbation count.'
}

function stringifyNumbers(values: number[] | undefined): string {
  if (!values?.length) return ''
  return values.map((value) => Number(value).toString()).join(', ')
}

function stringifyStrings(values: string[] | undefined): string {
  if (!values?.length) return ''
  return values.join(', ')
}

function presetAxisInputs(preset: 'fast' | 'full'): Record<SweepAxis, string> {
  const definition = AUTOSWEEP_PRESETS[preset]
  return {
    ascii_ratio: stringifyNumbers(definition.sweeps.ascii_ratio),
    emoji_count: stringifyNumbers(definition.sweeps.emoji_count),
    url_on: stringifyNumbers(definition.sweeps.url_on),
    normalize: stringifyStrings(definition.sweeps.normalize),
    zwj_on: stringifyNumbers(definition.sweeps.zwj_on),
    perturbations: stringifyNumbers(definition.sweeps.perturbations)
  }
}

function parseNumberList(raw: string): number[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => Number(entry))
    .filter((value) => Number.isFinite(value))
}

function parseStringList(raw: string): string[] {
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function buildSweepConfig(inputs: Record<SweepAxis, string>): SweepConfig {
  return {
    ascii_ratio: parseNumberList(inputs.ascii_ratio ?? ''),
    emoji_count: parseNumberList(inputs.emoji_count ?? ''),
    url_on: parseNumberList(inputs.url_on ?? ''),
    normalize: parseStringList(inputs.normalize ?? ''),
    zwj_on: parseNumberList(inputs.zwj_on ?? ''),
    perturbations: parseNumberList(inputs.perturbations ?? '')
  }
}

function formatElapsed(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0.0s'
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function countLines(text: string): number {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length
}

export interface AutoSweepRunRequest {
  lines: string[]
  tokenizers: string[]
  sweeps: SweepConfig
  enabledAxes: SweepAxis[]
  preset: 'fast' | 'full' | 'custom'
  sampleLines: number
  repeats: number
  flushEvery: number
  seed?: number
  axisSampleLines?: Partial<Record<SweepAxis, number>>
}

interface AutoSweepViewProps {
  text: string
  onTextChange: (value: string) => void
  models: ModelInfo[]
  pinnedTokenizerIds: string[]
  selectedTokenizers: string[]
  onTokenizersChange: (value: string[]) => void
  status: 'idle' | 'running' | 'done' | 'error'
  progress: { processed: number; total: number }
  elapsedMs: number
  rows: AutoSweepCsvRow[]
  chunkCount: number
  error?: string | null
  lastRunConfig?: Record<string, unknown> | null
  downloadReady: boolean
  onRun: (request: AutoSweepRunRequest, configPreview: Record<string, unknown>) => void
  onCancel: () => void
  onDownload: () => void
  onReset: () => void
}

export function AutoSweepView({
  text,
  onTextChange,
  models,
  pinnedTokenizerIds,
  selectedTokenizers,
  onTokenizersChange,
  status,
  progress,
  elapsedMs,
  rows,
  chunkCount,
  error,
  lastRunConfig,
  downloadReady,
  onRun,
  onCancel,
  onDownload,
  onReset
}: AutoSweepViewProps) {
  const [preset, setPreset] = useState<'fast' | 'full' | 'custom'>('fast')
  const [axisInputs, setAxisInputs] = useState<Record<SweepAxis, string>>(() => presetAxisInputs('fast'))
  const [axisEnabled, setAxisEnabled] = useState<Set<SweepAxis>>(() => {
    const defaults = presetAxisInputs('fast')
    return new Set(AXIS_ORDER.filter((axis) => defaults[axis]?.trim().length))
  })
  const [sampleLines, setSampleLines] = useState<number>(AUTOSWEEP_PRESETS.fast.sampleLines)
  const [axisSampleLines, setAxisSampleLines] = useState<Partial<Record<SweepAxis, number>>>(() => ({
    ...(AUTOSWEEP_PRESETS.fast.axisSampleLines ?? {})
  }))
  const [repeats, setRepeats] = useState<number>(AUTOSWEEP_PRESETS.fast.repeats)
  const [flushEvery, setFlushEvery] = useState<number>(200)
  const [seed, setSeed] = useState<string>('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [fileLabel, setFileLabel] = useState<string>('No file selected')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (preset === 'custom') {
      return
    }
    const defaults = presetAxisInputs(preset)
    setAxisInputs(defaults)
    setAxisEnabled(new Set(AXIS_ORDER.filter((axis) => defaults[axis]?.trim().length)))
    setSampleLines(AUTOSWEEP_PRESETS[preset].sampleLines)
    setAxisSampleLines({ ...(AUTOSWEEP_PRESETS[preset].axisSampleLines ?? {}) })
    setRepeats(AUTOSWEEP_PRESETS[preset].repeats)
  }, [preset])

  const pinnedSet = useMemo(() => new Set(pinnedTokenizerIds), [pinnedTokenizerIds])

  const sweeps = useMemo(() => buildSweepConfig(axisInputs), [axisInputs])

  const enabledAxes = useMemo(() => {
    return AXIS_ORDER.filter((axis) => axisEnabled.has(axis) && (sweeps[axis]?.length ?? 0) > 0)
  }, [axisEnabled, sweeps])

  const parsedSeed = useMemo(() => {
    const trimmed = seed.trim()
    if (!trimmed) return undefined
    const value = Number(trimmed)
    return Number.isFinite(value) ? value : NaN
  }, [seed])

  const sanitizedAxisSampleLines = useMemo(() => {
    return Object.fromEntries(
      Object.entries(axisSampleLines)
        .map(([axis, value]) => [axis, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value > 0)
    ) as Partial<Record<SweepAxis, number>>
  }, [axisSampleLines])

  const configPreview = useMemo(() => {
    const payload: Record<string, unknown> = {
      preset,
      sample_lines: sampleLines,
      repeats,
      flush_every: flushEvery,
      sweeps,
      tokenizers: selectedTokenizers,
      enabled_axes: enabledAxes
    }
    if (Object.keys(sanitizedAxisSampleLines).length > 0) {
      payload.axis_sample_lines = sanitizedAxisSampleLines
    }
    if (parsedSeed !== undefined && !Number.isNaN(parsedSeed)) {
      payload.seed = parsedSeed
    }
    return payload
  }, [
    preset,
    sampleLines,
    repeats,
    flushEvery,
    sweeps,
    selectedTokenizers,
    enabledAxes,
    sanitizedAxisSampleLines,
    parsedSeed
  ])

  const configJson = useMemo(() => JSON.stringify(configPreview, null, 2), [configPreview])

  const previewRows = useMemo(() => rows.slice(0, 20), [rows])

  const lineCount = useMemo(() => countLines(text), [text])

  const progressLabel = useMemo(() => {
    if (!progress.total) {
      return `${progress.processed} / ?`
    }
    const percentage = progress.total > 0 ? Math.floor((progress.processed / progress.total) * 100) : 0
    return `${progress.processed} / ${progress.total} (${percentage}%)`
  }, [progress])

  const running = status === 'running'

  const handleToggleAxis = useCallback((axis: SweepAxis) => {
    setAxisEnabled((current) => {
      const next = new Set(current)
      if (next.has(axis)) {
        next.delete(axis)
      } else {
        next.add(axis)
      }
      return next
    })
  }, [])

  const handleSweepInput = useCallback((axis: SweepAxis, value: string) => {
    setAxisInputs((current) => ({ ...current, [axis]: value }))
  }, [])

  const handleAxisSampleLinesChange = useCallback((axis: SweepAxis, rawValue: string) => {
    setAxisSampleLines((current) => {
      const next = { ...current }
      if (rawValue.trim().length === 0) {
        delete next[axis]
        return next
      }
      const numeric = Number(rawValue)
      if (!Number.isFinite(numeric)) {
        return next
      }
      return { ...next, [axis]: numeric }
    })
  }, [])

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result
        if (typeof result === 'string') {
          const normalized = result.replace(/\r\n/g, '\n')
          const combined = text ? `${text.replace(/\s+$/, '')}\n${normalized}` : normalized
          onTextChange(combined)
          setFileLabel(`${file.name} (${countLines(normalized)} lines)`)
        }
      }
      reader.readAsText(file)
      event.target.value = ''
    },
    [onTextChange, text]
  )

  const handleRun = useCallback(() => {
    setLocalError(null)

    if (!selectedTokenizers.length) {
      setLocalError('Select at least one tokenizer before running AutoSweep.')
      return
    }

    const trimmedLines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    if (!trimmedLines.length) {
      setLocalError('Add at least one non-empty line to sweep over.')
      return
    }

    if (parsedSeed !== undefined && Number.isNaN(parsedSeed)) {
      setLocalError('Seed must be a finite number.')
      return
    }

    if (repeats <= 0) {
      setLocalError('Repeats per mutation must be at least 1.')
      return
    }

    if (sampleLines <= 0) {
      setLocalError('Sample lines must be at least 1.')
      return
    }

    const request: AutoSweepRunRequest = {
      lines: trimmedLines,
      tokenizers: selectedTokenizers,
      sweeps,
      enabledAxes,
      preset,
      sampleLines,
      repeats,
      flushEvery,
      seed: parsedSeed !== undefined && !Number.isNaN(parsedSeed) ? parsedSeed : undefined,
      axisSampleLines: Object.keys(sanitizedAxisSampleLines).length ? sanitizedAxisSampleLines : undefined
    }

    onRun(request, configPreview)
  }, [
    selectedTokenizers,
    text,
    parsedSeed,
    sweeps,
    enabledAxes,
    preset,
    sampleLines,
    repeats,
    flushEvery,
    sanitizedAxisSampleLines,
    configPreview,
    onRun
  ])

  const handleTokenizerChange = useCallback(
    (value: string[]) => {
      onTokenizersChange(value)
    },
    [onTokenizersChange]
  )

  return (
    <div className="space-y-6">
      <Card className="bg-card/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Input text</CardTitle>
          <CardDescription>Paste sentences (one per line) or upload a plain text file.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => onTextChange(event.target.value)}
            placeholder="Paste up to a few hundred sentences, one per line."
            className="min-h-[180px] bg-background/70"
            disabled={running}
          />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-sm font-medium">
              <Input
                ref={fileInputRef}
                type="file"
                accept=".txt,.log,.csv,.json,.md"
                onChange={handleFileChange}
                disabled={running}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={running}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" /> Add text file
              </Button>
              <span className="text-xs text-muted-foreground">{fileLabel}</span>
            </div>
            <p className="text-xs text-muted-foreground">{lineCount} prepared line{lineCount === 1 ? '' : 's'}.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <Card className="bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sweep configuration</CardTitle>
            <CardDescription>Choose preset, tweak sample size, and toggle mutation axes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Preset</Label>
              <ToggleGroup
                type="single"
                value={preset}
                onValueChange={(value) => {
                  if (value) setPreset(value as typeof preset)
                }}
                className="flex flex-wrap gap-2"
              >
                {(['fast', 'full', 'custom'] as const).map((value) => {
                  const presetMeta = value !== 'custom' ? AUTOSWEEP_PRESETS[value] : null
                  return (
                    <ToggleGroupItem
                      key={value}
                      value={value}
                      className="px-4 py-2 text-sm font-medium"
                    >
                      <span className="flex items-center gap-2">
                        <Wand2 className="h-4 w-4" />
                        {value === 'custom' ? 'Custom' : presetMeta?.label}
                      </span>
                    </ToggleGroupItem>
                  )
                })}
              </ToggleGroup>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="sample-lines" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Sample lines
                </Label>
                <Input
                  id="sample-lines"
                  type="number"
                  min={1}
                  value={sampleLines}
                  onChange={(event) => setSampleLines(Number(event.target.value) || 0)}
                  disabled={running}
                />
              </div>
              <div className="space-y-2">
                <Label
                  htmlFor="ascii-sample-lines"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  ASCII axis sample lines
                </Label>
                <Input
                  id="ascii-sample-lines"
                  type="number"
                  min={1}
                  value={axisSampleLines.ascii_ratio ?? ''}
                  onChange={(event) => handleAxisSampleLinesChange('ascii_ratio', event.target.value)}
                  disabled={running}
                />
                <p className="text-xs text-muted-foreground">
                  Overrides per-bin sampling when the ASCII ratio axis is enabled. Leave blank to inherit.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="sweep-repeats" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Repeats per mutation
                </Label>
                <Input
                  id="sweep-repeats"
                  type="number"
                  min={1}
                  value={repeats}
                  onChange={(event) => setRepeats(Number(event.target.value) || 0)}
                  disabled={running}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="flush-every" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Flush every (rows)
                </Label>
                <Input
                  id="flush-every"
                  type="number"
                  min={1}
                  value={flushEvery}
                  onChange={(event) => setFlushEvery(Math.max(1, Number(event.target.value) || 0))}
                  disabled={running}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="autosweep-seed" className="text-xs uppercase tracking-wide text-muted-foreground">
                  Deterministic seed (optional)
                </Label>
                <Input
                  id="autosweep-seed"
                  type="text"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  disabled={running}
                />
              </div>
            </div>

            <div className="space-y-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Sweep axes</Label>
              <div className="space-y-3 rounded-lg border border-dashed border-border/60 p-4">
                {AXIS_ORDER.map((axis) => {
                  const enabled = axisEnabled.has(axis)
                  const inputValue = axisInputs[axis] ?? ''
                  return (
                    <div key={axis} className="space-y-2">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-foreground">{AXIS_LABEL[axis]}</p>
                          <p className="text-xs text-muted-foreground">{AXIS_HELP_TEXT[axis]}</p>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleToggleAxis(axis)}
                            disabled={running}
                          />
                          Enabled
                        </label>
                      </div>
                      <Input
                        value={inputValue}
                        placeholder={axis === 'normalize' ? 'NFC, NFD' : 'Comma separated values'}
                        onChange={(event) => handleSweepInput(axis, event.target.value)}
                        disabled={running || preset !== 'custom'}
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tokenizer selection</CardTitle>
            <CardDescription>Pick one or many tokenizers to sweep.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ToggleGroup
              type="multiple"
              value={selectedTokenizers}
              onValueChange={handleTokenizerChange}
              className="flex flex-wrap gap-2"
            >
              {models.map((model) => (
                <ToggleGroupItem
                  key={model.id}
                  value={model.id}
                  className="px-3 py-2 text-xs font-medium data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                >
                  <span className="flex flex-col">
                    <span>{model.shortName ?? model.name}</span>
                    <span className="text-[10px] text-muted-foreground">{model.id}</span>
                    {pinnedSet.has(model.id) ? (
                      <span className="text-[10px] font-semibold text-primary/80">Pinned</span>
                    ) : null}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <p className="text-xs text-muted-foreground">{selectedTokenizers.length} tokenizer{selectedTokenizers.length === 1 ? '' : 's'} selected.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Run control & provenance preview</CardTitle>
          <CardDescription>This is the JSON that will be embedded into provenance.autosweep.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={handleRun} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Running AutoSweep
                </>
              ) : (
                'Run AutoSweep'
              )}
            </Button>
            {running ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : null}
            {rows.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                disabled={!downloadReady}
                onClick={onDownload}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" /> Download CSV
              </Button>
            ) : null}
            {((rows.length > 0 || status === 'done' || status === 'error') && !running) ? (
              <Button type="button" variant="ghost" onClick={onReset}>
                Reset
              </Button>
            ) : null}
            <div className="text-sm text-muted-foreground">
              Progress: {progressLabel} | Elapsed: {formatElapsed(elapsedMs)} | Chunks: {chunkCount} | Rows: {rows.length}
            </div>
          </div>

          {status === 'done' ? (
            <div className="rounded-md border border-emerald-400/50 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> AutoSweep finished in {formatElapsed(elapsedMs)} with {rows.length} rows.
              </div>
            </div>
          ) : null}

          {status === 'error' ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {error ?? 'AutoSweep encountered an unexpected error.'}
              </div>
            </div>
          ) : null}

          {localError ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
              {localError}
            </div>
          ) : null}

          {lastRunConfig ? (
            <details className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs leading-relaxed">
              <summary className="cursor-pointer text-sm font-semibold text-foreground">
                Last run config JSON (embedded in provenance)
              </summary>
              <pre className="mt-2 max-h-[220px] overflow-auto text-[11px] leading-relaxed">
                {JSON.stringify(lastRunConfig, null, 2)}
              </pre>
            </details>
          ) : null}

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Config preview</Label>
            <pre className="max-h-[220px] overflow-auto rounded-md bg-muted/40 p-3 text-[11px] leading-relaxed">
              {configJson}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Row preview</CardTitle>
          <CardDescription>Showing the first {previewRows.length} of {rows.length} rows (max 20) collected in memory.</CardDescription>
        </CardHeader>
        <CardContent>
          {previewRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Rows will appear here once AutoSweep streams progress.</p>
          ) : (
            <div className="max-h-[260px] overflow-auto rounded-md border border-border/60">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted/50">
                  <tr>
                    <th className="px-2 py-1">Template</th>
                    <th className="px-2 py-1">Axis</th>
                    <th className="px-2 py-1">Value</th>
                    <th className="px-2 py-1">Timed op</th>
                    <th className="px-2 py-1">Tokenizer</th>
                    <th className="px-2 py-1 text-right">Tokens</th>
                    <th className="px-2 py-1 text-right">Bytes/token</th>
                    <th className="px-2 py-1 text-right">Median ms</th>
                    <th className="px-2 py-1">Debug</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, index) => {
                    const isDebug = row.debug_sample_rank !== null && row.debug_sample_rank !== undefined
                    return (
                      <tr
                        key={`${row.template_id}-${row.tokenizer_id}-${index}`}
                        className={`${isDebug ? 'bg-amber-50/40' : ''} border-t border-border/60`}
                      >
                        <td className="px-2 py-1 font-mono">{row.template_id}</td>
                        <td className="px-2 py-1">{row.sweep_axis}</td>
                        <td className="px-2 py-1">{row.x_value}</td>
                        <td className="px-2 py-1">{row.timed_op}</td>
                        <td className="px-2 py-1">{row.tokenizer_id}</td>
                        <td className="px-2 py-1 text-right">{row.token_count}</td>
                        <td className="px-2 py-1 text-right">{row.bytes_per_token.toFixed(2)}</td>
                        <td className="px-2 py-1 text-right">{row.time_ms_median.toFixed(2)}</td>
                        <td className="px-2 py-1 text-xs font-medium text-amber-700">
                          {isDebug ? `Debug #${row.debug_sample_rank}` : ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
