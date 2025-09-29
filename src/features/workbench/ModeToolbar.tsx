import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { ChevronsUpDown, GitCompare, ListTree, Sparkles, Square } from 'lucide-react'
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { ButtonGroup } from '../../components/ui/button-group'
import { cn } from '../../lib/utils'
import type { Mode } from './constants'
import { CATEGORY_LABELS } from './constants'
import type { ModelCategory, ModelInfo } from '../../tokenizers'

interface ModeToolbarProps {
  mode: Mode
  onModeChange: (mode: Mode) => void
  models: ModelInfo[]
  selectedModelId: string
  onSelectModel: (modelId: string) => void
  selectedModelInfo?: ModelInfo
}

type ModelsByCategory = Record<ModelCategory, ModelInfo[]>

export function ModeToolbar({
  mode,
  onModeChange,
  models,
  selectedModelId,
  onSelectModel,
  selectedModelInfo
}: ModeToolbarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const flatModelIds = useMemo(() => models.map((model) => model.id), [models])
  const modelsByCategory = useMemo<ModelsByCategory>(() => {
    return models.reduce<ModelsByCategory>(
      (acc, model) => {
        acc[model.category] = [...(acc[model.category] ?? []), model]
        return acc
      },
      { basic: [], indian: [], frontier: [] }
    )
  }, [models])

  useEffect(() => {
    if (!menuOpen) {
      setHighlightedId(null)
      return
    }
    setHighlightedId(selectedModelId)
  }, [menuOpen, selectedModelId])

  // Close menu when switching away from single mode
  useEffect(() => {
    if (mode !== 'single') {
      setMenuOpen(false)
    }
  }, [mode])

  useEffect(() => {
    if (!menuOpen) return

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [menuOpen])

  function focusModel(modelId: string) {
    setHighlightedId(modelId)
    const node = buttonRefs.current[modelId]
    if (node) {
      node.focus()
      node.scrollIntoView({ block: 'nearest' })
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, currentId: string) {
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
      handleSelect(currentId)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      setMenuOpen(false)
    }
  }

  function handleSelect(modelId: string) {
    onSelectModel(modelId)
    setMenuOpen(false)
  }

  const modeOptions = useMemo(
    () => [
      {
        label: (
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <Square className="h-4 w-4" /> Single
          </span>
        ),
        value: 'single'
      },
      {
        label: (
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <GitCompare className="h-4 w-4" /> Compare
          </span>
        ),
        value: 'compare'
      },
      {
        label: (
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <ListTree className="h-4 w-4" /> Batch
          </span>
        ),
        value: 'batch'
      },
      {
        label: (
          <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
            <Sparkles className="h-4 w-4" /> Auto
          </span>
        ),
        value: 'auto'
      }
    ],
    []
  )

  return (
    <Card className="border border-border/70 bg-card/70 shadow-xl shadow-primary/5">
      <CardHeader className="pb-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <CardTitle className="text-2xl">Workspace</CardTitle>
            <CardDescription className="text-sm">
              Select a model & switch modes. Smooth animated slider below.
            </CardDescription>
          </div>
          <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
            <ButtonGroup
              value={mode}
              onChange={(value) => onModeChange(value as Mode)}
              options={modeOptions}
              className="min-w-[280px]"
            />
            {mode === 'single' && (
              <div className="relative">
                <button
                  ref={triggerRef}
                  onClick={() => setMenuOpen((prev) => !prev)}
                  className="flex w-[280px] items-center justify-between rounded-md border border-border/60 bg-background/70 px-4 py-2.5 text-left text-sm font-medium shadow-sm hover:bg-background/90"
                  aria-expanded={menuOpen}
                >
                  <span className="truncate">{selectedModelInfo?.name ?? 'Select tokenizer'}</span>
                  <ChevronsUpDown className="ml-2 h-4.5 w-4.5 opacity-60" />
                </button>
              {menuOpen && (
                <div
                  ref={menuRef}
                  className="absolute z-50 mt-2 max-h-[340px] w-[320px] overflow-auto overscroll-contain rounded-lg border border-border/60 bg-popover p-2 shadow-xl scrollbar-hidden"
                  role="menu"
                  aria-label="Tokenizer models"
                  aria-orientation="vertical"
                  aria-activedescendant={
                    highlightedId
                      ? `model-option-${highlightedId.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                      : undefined
                  }
                >
                  <div className="mb-2 flex items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span>Tokenizers</span>
                  </div>
                  <div className="space-y-4 pr-1">
                    {(Object.entries(modelsByCategory) as [ModelCategory, ModelInfo[]][]).map(([category, entries]) => (
                      <div key={category} className="space-y-1">
                        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-primary/70">
                          {CATEGORY_LABELS[category]}
                        </p>
                        <ul className="grid gap-1">
                          {entries.map((model) => {
                            const buttonId = `model-option-${model.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
                            const isSelected = selectedModelId === model.id
                            const isHighlighted = highlightedId === model.id && !isSelected
                            return (
                              <li key={model.id}>
                                <button
                                  id={buttonId}
                                  ref={(node) => {
                                    buttonRefs.current[model.id] = node
                                  }}
                                  role="menuitemradio"
                                  aria-checked={isSelected}
                                  tabIndex={isSelected ? 0 : -1}
                                  onClick={() => handleSelect(model.id)}
                                  onKeyDown={(event) => handleKeyDown(event, model.id)}
                                  onMouseEnter={() => setHighlightedId(model.id)}
                                  onFocus={() => setHighlightedId(model.id)}
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
            )}
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
  )
}
