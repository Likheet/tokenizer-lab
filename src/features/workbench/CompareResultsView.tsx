import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { ScrollArea } from '../../components/ui/scroll-area'
import { cn } from '../../lib/utils'
import type { TokenizationResult, ModelInfo } from '../../tokenizers'
import { CATEGORY_LABELS } from './constants'

interface CompareResultsViewProps {
  results: (TokenizationResult & { repo: string })[]
  modelLookup: Record<string, ModelInfo>
}

export function CompareResultsView({ results, modelLookup }: CompareResultsViewProps) {
  if (!results.length) {
    return null
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-xl font-semibold">Side-by-side comparison</h3>
        <p className="text-sm text-muted-foreground">
          Metrics and token streams for every tokenizer are displayed below. Hover a token chip to inspect IDs and offsets.
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {results.map((result) => {
          const modelInfo = modelLookup[result.repo]
          const displayName = modelInfo?.shortName ?? result.repo.split('/')[1]
          const categoryLabel = modelInfo?.category ? CATEGORY_LABELS[modelInfo.category] : 'Tokenizer'

          return (
            <Card key={result.repo} className="bg-card/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{displayName}</span>
                  <Badge variant="outline" className="text-xs">
                    {categoryLabel}
                  </Badge>
                </CardTitle>
                <CardDescription>{modelInfo?.name ?? result.repo}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-2 text-sm">
                  <MetricRow label="Tokens" value={result.metrics.tokenCount.toString()} />
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
                          className={cn(
                            'cursor-default whitespace-pre bg-background/70 px-2.5 py-1 font-mono text-[10px] tracking-tight shadow-sm ring-1 ring-inset ring-border/40 transition',
                            'hover:ring-border/60'
                          )}
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

interface MetricRowProps {
  label: string
  value: string
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
