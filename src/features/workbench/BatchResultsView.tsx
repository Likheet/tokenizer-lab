import { Download } from 'lucide-react'

import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { ScrollArea } from '../../components/ui/scroll-area'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '../../components/ui/table'
import { cn } from '../../lib/utils'
import type { Row, SummaryRow } from '../../compare'

interface BatchResultsViewProps {
  rows: Row[]
  summary: SummaryRow[]
  onExport: () => void
}

export function BatchResultsView({ rows, summary, onExport }: BatchResultsViewProps) {
  if (!rows.length) {
    return null
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold">Batch results</h3>
          <p className="text-sm text-muted-foreground">
            {rows.length} tokenizer x snippet rows captured with median latency over 5 runs (+/- MAD). Slice overrides are baked into the CSV schema.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={onExport}>
          <Download className="mr-2 h-4 w-4" /> Export CSVs
        </Button>
      </div>

      <ScrollArea className="h-[360px] w-full rounded-lg border border-border/60 bg-background/70">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tokenizer</TableHead>
              <TableHead>Slice</TableHead>
              <TableHead>Lang tag</TableHead>
              <TableHead>Sample text</TableHead>
              <TableHead className="w-[90px]">Tokens</TableHead>
              <TableHead className="w-[100px]">Graphemes</TableHead>
              <TableHead className="w-[90px]">Bytes</TableHead>
              <TableHead className="w-[120px]">ASCII bytes %</TableHead>
              <TableHead className="w-[120px]">Tokens / 100</TableHead>
              <TableHead className="w-[120px]">Bytes / token</TableHead>
              <TableHead className="w-[130px]">Avg token len</TableHead>
              <TableHead className="w-[90px]">UNK count</TableHead>
              <TableHead className="w-[90px]">UNK %</TableHead>
              <TableHead className="w-[160px]">Latency (ms)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => {
              const unkRatio = row.unk_percent / 100
              return (
                <TableRow key={`${row.tokenizer_id}-${index}`}>
                  <TableCell className="font-medium text-foreground">
                    <div className="flex flex-col">
                      <span>{row.tokenizer_display_name}</span>
                      <span className="text-[11px] text-muted-foreground">{row.tokenizer_id}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="px-2 py-0.5 text-xs uppercase tracking-wide">
                      {row.slice}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">{row.lang_tag}</TableCell>
                  <TableCell className="max-w-[320px] truncate font-mono text-xs text-muted-foreground" title={row.text}>
                    {row.text}
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">{formatInteger(row.token_count)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatInteger(row.grapheme_count)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatInteger(row.byte_count)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatPercent(row.ascii_ratio_bytes)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatFloat(row.tokens_per_100_chars)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatFloat(row.bytes_per_token)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatFloat(row.avg_token_len_graphemes)}</TableCell>
                  <TableCell className="tabular-nums font-medium">{formatInteger(row.unk_count)}</TableCell>
                  <TableCell
                    className={cn(
                      'tabular-nums font-medium',
                      unkRatio > 0 ? 'text-destructive' : 'text-foreground'
                    )}
                  >
                    {formatPercent(unkRatio)}
                  </TableCell>
                  <TableCell className="tabular-nums font-medium">{formatLatency(row.time_ms_median, row.time_ms_mad)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </ScrollArea>

      {summary.length > 0 && (
        <Card className="bg-card/70">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Slice-level summary</CardTitle>
            <CardDescription>
              Averages and spread by tokenizer + slice. UNK metrics use the 0-1 rate recorded in the CSV.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {summary.map((item) => (
                <div key={`${item.tokenizer_id}-${item.slice}`} className="rounded-lg border border-border/60 bg-background/60 p-4">
                  <div className="flex items-baseline justify-between">
                    <div className="flex flex-col">
                      <h4 className="text-sm font-semibold text-foreground">{item.tokenizer_display_name}</h4>
                      <span className="text-[11px] text-muted-foreground">{item.tokenizer_id}</span>
                    </div>
                    <Badge variant="outline" className="text-xs uppercase tracking-wide">
                      {item.slice}
                    </Badge>
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <SummaryMetric
                      label="Mean tokens"
                      value={`${formatFloat(item.mean_tokens)} +/- ${formatFloat(item.stddev_tokens)}`}
                      tooltip={`95% CI: [${formatFloat(item.ci_tokens_lower)}, ${formatFloat(item.ci_tokens_upper)}] (n=${item.sample_count})`}
                    />
                    <SummaryMetric
                      label="Tokens / 100"
                      value={`${formatFloat(item.mean_tokens_per_100)} +/- ${formatFloat(item.stddev_tokens_per_100)}`}
                      tooltip={`95% CI: [${formatFloat(item.ci_tokens_per_100_lower)}, ${formatFloat(item.ci_tokens_per_100_upper)}]`}
                    />
                    <SummaryMetric
                      label="Bytes / token"
                      value={`${formatFloat(item.mean_bytes_per_token)} +/- ${formatFloat(item.stddev_bytes_per_token)}`}
                      tooltip={`95% CI: [${formatFloat(item.ci_bytes_per_token_lower)}, ${formatFloat(item.ci_bytes_per_token_upper)}]`}
                    />
                    <SummaryMetric
                      label="UNK %"
                      value={`${formatPercent(item.mean_unk)} +/- ${formatPercent(item.stddev_unk)}`}
                      tooltip={`95% CI: [${formatPercent(item.ci_unk_lower)}, ${formatPercent(item.ci_unk_upper)}]`}
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

interface SummaryMetricProps {
  label: string
  value: string
  tooltip?: string
  highlight?: boolean
}

function SummaryMetric({ label, value, tooltip, highlight }: SummaryMetricProps) {
  return (
    <div className="flex items-center justify-between text-sm" title={tooltip}>
      <span className="text-muted-foreground">{label}</span>
      <span className={highlight ? 'font-semibold text-destructive' : 'font-semibold text-foreground'}>
        {value}
      </span>
    </div>
  )
}

function formatInteger(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return Math.round(value).toLocaleString('en-US')
}

function formatFloat(value: number, fractionDigits = 2): string {
  if (!Number.isFinite(value)) return Number(0).toFixed(fractionDigits)
  return value.toLocaleString('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0.00%'
  return `${(value * 100).toFixed(2)}%`
}

function formatLatency(median: number, mad: number): string {
  if (!Number.isFinite(median)) return '0.00 +/- 0.00'
  const medianFormatted = median.toFixed(2)
  const madFormatted = Number.isFinite(mad) ? mad.toFixed(2) : '0.00'
  return `${medianFormatted} +/- ${madFormatted}`
}
