import { Badge } from '../../components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../../components/ui/select'
import { ScrollArea } from '../../components/ui/scroll-area'
import { cn } from '../../lib/utils'
import type { TokenizationResult } from '../../tokenizers'
import { METRIC_FIELDS, TOKEN_VIEW_OPTIONS, type TokenView } from './constants'

interface SingleResultViewProps {
  result: TokenizationResult
  tokenView: TokenView
  onTokenViewChange: (view: TokenView) => void
}

export function SingleResultView({ result, tokenView, onTokenViewChange }: SingleResultViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <Card className="bg-card/70">
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-semibold">Tokenization metrics</CardTitle>
              <CardDescription className="text-base">High-level stats for the current tokenizer run.</CardDescription>
            </div>
            <Badge variant="outline" className="px-4 py-2 text-sm">
              <span className="font-bold">{result.metrics.tokenCount}</span>&nbsp;tokens in total
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {METRIC_FIELDS.map(({ key, label, format }) => {
              const value = result.metrics[key]
              const formatted = typeof value === 'number' ? (format ? format(value) : value.toString()) : '-'
              const isDestructive = key === 'unkPercentage' && typeof value === 'number' && value > 0

              return (
                <div
                  key={key}
                  className={cn(
                    'flex flex-col rounded-lg border bg-background/60 px-4 py-3',
                    isDestructive ? 'border-destructive/30 bg-destructive/5' : 'border-border/60'
                  )}
                >
                  <span className={cn(
                    'text-sm font-medium uppercase tracking-wide text-muted-foreground',
                    isDestructive && 'text-destructive'
                  )}
                  >
                    {label}
                  </span>
                  <span className={cn(
                    'text-xl tabular-nums font-semibold text-foreground',
                    isDestructive && 'text-destructive'
                  )}
                  >
                    {formatted}
                  </span>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card/70">
        <CardHeader className="flex flex-col gap-3 pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-2xl font-semibold">Token explorer</CardTitle>
            <CardDescription className="text-base">
              Switch views to inspect IDs, source offsets, or raw model tokens.
            </CardDescription>
          </div>
          <Badge variant="outline" className="px-3 py-2 text-sm">
            Tokens: <span className="font-bold ml-1">{result.tokens.length}</span>
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={tokenView} onValueChange={(value) => onTokenViewChange(value as TokenView)}>
              <SelectTrigger className="w-full sm:w-[250px]">
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
          </div>
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
                  const label = offsets ? `${offsets[0]}-${offsets[1]}` : '-'
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
                    className="cursor-default whitespace-pre bg-background/70 px-3 py-2 font-mono text-sm tracking-tight shadow-sm border border-border/40"
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
