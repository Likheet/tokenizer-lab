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
