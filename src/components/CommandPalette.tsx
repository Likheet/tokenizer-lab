import { useEffect, useState } from 'react'
import * as Dialog from './ui/dialog'
import { Command } from 'cmdk'
import { Search, Zap, GitCompare, ListTree } from 'lucide-react'
import { cn } from '../lib/utils'

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMode: (mode: 'single' | 'compare' | 'batch') => void
}

const MODES: { key: 'single' | 'compare' | 'batch'; title: string; description: string; icon: any }[] = [
  { key: 'single', title: 'Single run', description: 'Tokenize one snippet with a selected tokenizer', icon: Zap },
  { key: 'compare', title: 'Compare models', description: 'Run the same text across all tokenizers', icon: GitCompare },
  { key: 'batch', title: 'Batch analysis', description: 'Benchmark a list of snippets across models', icon: ListTree }
]

export function CommandPalette({ open, onOpenChange, onSelectMode }: CommandPaletteProps) {
  const [search, setSearch] = useState('')

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <Dialog.Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.DialogContent className="p-0 overflow-hidden">
        <Command className="flex w-full flex-col gap-2 rounded-lg bg-background">
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-60" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Type a command or search modes…"
              className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <Command.List className="max-h-[340px] overflow-y-auto p-2">
            <Command.Empty className="p-4 text-center text-sm text-muted-foreground">
              No matches.
            </Command.Empty>
            <Command.Group heading="Modes" className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {MODES.filter(m => m.title.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase())).map(m => {
                const Icon = m.icon
                return (
                  <Command.Item
                    key={m.key}
                    value={m.key}
                    onSelect={() => {
                      onSelectMode(m.key)
                      onOpenChange(false)
                    }}
                    className={cn(
                      'group flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground'
                    )}
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground group-aria-selected:bg-primary group-aria-selected:text-primary-foreground">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="flex flex-col">
                      <span className="font-medium leading-none">{m.title}</span>
                      <span className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                        {m.description}
                      </span>
                    </div>
                  </Command.Item>
                )
              })}
            </Command.Group>
          </Command.List>
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>Press Esc to close</span>
            <span className="hidden items-center gap-1 sm:flex">
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl</kbd>
              <span>+</span>
              <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">K</kbd>
            </span>
          </div>
        </Command>
      </Dialog.DialogContent>
    </Dialog.Dialog>
  )
}
