import { Sparkles, Wand2 } from 'lucide-react'

import { Button } from '../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '../../components/ui/dropdown-menu'
import { Slider } from '../../components/ui/slider'
import { Switch } from '../../components/ui/switch'
import {
  SAMPLE_LANGUAGE_OPTIONS,
  SAMPLE_LENGTH_LABELS,
  SAMPLE_LENGTH_ORDER,
  type SampleLanguage,
  type SampleLength
} from './sampleData'
import type { Mode } from './constants'

interface SampleControlsProps {
  target: Mode
  sampleLength: SampleLength
  onSampleLengthChange: (target: Mode, length: SampleLength) => void
  includeEmojis: boolean
  onIncludeEmojisChange: (next: boolean) => void
  onSelectSample: (language: SampleLanguage, target: Mode) => void
}

export function SampleControls({
  target,
  sampleLength,
  onSampleLengthChange,
  includeEmojis,
  onIncludeEmojisChange,
  onSelectSample
}: SampleControlsProps) {
  const sliderIndex = Math.max(0, SAMPLE_LENGTH_ORDER.indexOf(sampleLength))
  const sliderLabel = SAMPLE_LENGTH_LABELS[sampleLength]
  const emojiToggleId = `emoji-toggle-${target}`

  return (
    <div className="absolute bottom-3 right-3 flex items-center gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-2.5 py-1 shadow-sm">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Size</span>
        <Slider
          value={[sliderIndex]}
          min={0}
          max={SAMPLE_LENGTH_ORDER.length - 1}
          step={1}
          onValueChange={(value) => {
            const nextIndex = value[0] ?? 0
            const nextLength = SAMPLE_LENGTH_ORDER[nextIndex] ?? 'small'
            if (nextLength !== sampleLength) {
              onSampleLengthChange(target, nextLength)
            }
          }}
          className="w-24"
          aria-label="Sample length"
        />
        <span className="text-[11px] font-medium text-foreground">{sliderLabel}</span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-2.5 py-1 shadow-sm">
        <Switch
          id={emojiToggleId}
          checked={includeEmojis}
          onCheckedChange={onIncludeEmojisChange}
          aria-label="Toggle emoji augmentation"
        />
        <label
          htmlFor={emojiToggleId}
          className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" /> Emoji
        </label>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex items-center gap-2 bg-background/90"
            aria-label="Insert sample text"
          >
            <Wand2 className="h-4 w-4" />
            <span className="text-xs font-semibold">Samples</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[8rem]">
          {SAMPLE_LANGUAGE_OPTIONS.map((option) => (
            <DropdownMenuItem
              key={`${target}-sample-${option.value}`}
              onSelect={() => onSelectSample(option.value, target)}
            >
              {option.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
