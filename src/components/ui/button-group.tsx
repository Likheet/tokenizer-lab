// components/ui/button-group.tsx
import { cn } from "../../lib/utils"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "./toggle-group" // shadcn/ui

type ButtonGroupProps = {
  value?: string
  onChange?: (v: string) => void
  options: { label: React.ReactNode; value: string }[]
  className?: string
}

export function ButtonGroup({
  value,
  onChange,
  options,
  className,
}: ButtonGroupProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg bg-muted/40 p-1.5", // container pill
        className
      )}
    >
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(v) => v && onChange?.(v)}
        className="gap-1.5"
      >
        {options.map((o) => (
          <ToggleGroupItem
            key={o.value}
            value={o.value}
            aria-label={typeof o.label === 'string' ? o.label : undefined}
            className={cn(
              // make it look like a segmented control
              "px-4 py-2 text-sm font-medium",
              "rounded-md data-[state=on]:bg-primary data-[state=on]:text-primary-foreground",
              "data-[state=on]:shadow-md transition-colors",
              "hover:bg-muted/60"
            )}
          >
            {o.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}