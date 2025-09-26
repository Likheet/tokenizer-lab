import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../../lib/utils'

type Size = 'xs' | 'sm' | 'md' | 'lg'

interface SegmentGroupContextValue {
  value: string | null
  setValue: (v: string) => void
  name: string
  size: Size
  disabled?: boolean
  register: (value: string, ref: HTMLButtonElement | null) => void
  getRef: (value: string) => HTMLButtonElement | null
}

const SegmentGroupContext = createContext<SegmentGroupContextValue | null>(null)

function useSegmentGroup() {
  const ctx = useContext(SegmentGroupContext)
  if (!ctx) throw new Error('SegmentGroup components must be used within <SegmentGroup.Root>')
  return ctx
}

// Root
interface RootProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: string | null
  defaultValue?: string
  onValueChange?: (details: { value: string }) => void
  name?: string
  size?: Size
  disabled?: boolean
  orientation?: 'horizontal' | 'vertical'
}

const sizeStyles: Record<Size, { gap: string; padding: string; font: string; height: string }> = {
  xs: { gap: 'gap-0.5', padding: 'p-0.5', font: 'text-[11px]', height: 'h-7' },
  sm: { gap: 'gap-0.5', padding: 'p-0.5', font: 'text-xs', height: 'h-8' },
  md: { gap: 'gap-1', padding: 'p-1', font: 'text-sm', height: 'h-10' },
  lg: { gap: 'gap-1', padding: 'p-1', font: 'text-base', height: 'h-11' }
}

const Root = React.forwardRef<HTMLDivElement, RootProps>(function SegmentGroupRoot(
  { value: valueProp, defaultValue, onValueChange, name, disabled, size = 'md', orientation = 'horizontal', className, children, ...rest },
  ref
) {
  const internalName = useId()
  const [uncontrolled, setUncontrolled] = useState<string | null>(defaultValue ?? null)
  const isControlled = valueProp !== undefined
  const value = (isControlled ? valueProp : uncontrolled) ?? null
  const registry = useRef(new Map<string, HTMLButtonElement | null>())

  const setValue = useCallback(
    (v: string) => {
      if (!isControlled) setUncontrolled(v)
      onValueChange?.({ value: v })
    },
    [isControlled, onValueChange]
  )

  const register = useCallback((v: string, element: HTMLButtonElement | null) => {
    if (element) {
      registry.current.set(v, element)
    } else {
      registry.current.delete(v)
    }
  }, [])

  const getRef = useCallback((v: string) => registry.current.get(v) ?? null, [])

  const ctx: SegmentGroupContextValue = {
    value,
    setValue,
    name: name ?? internalName,
    size,
    disabled,
    register,
    getRef
  }

  return (
    <SegmentGroupContext.Provider value={ctx}>
      <div
        ref={ref}
        role="radiogroup"
        aria-disabled={disabled || undefined}
        data-orientation={orientation}
        className={cn(
          'relative isolate flex overflow-hidden rounded-xl border border-border/50 bg-muted/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md supports-[backdrop-filter]:bg-muted/10',
          orientation === 'vertical' ? 'flex-col' : 'flex-row',
          sizeStyles[size].height,
          sizeStyles[size].padding,
          sizeStyles[size].gap,
          className
        )}
        {...rest}
      >
        {children}
      </div>
    </SegmentGroupContext.Provider>
  )
})

// Item
interface ItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
  disabled?: boolean
}

const Item = React.forwardRef<HTMLButtonElement, ItemProps>(function SegmentGroupItem(
  { value, disabled: itemDisabled, className, children, ...rest },
  ref
) {
  const { value: selected, setValue, size, disabled: groupDisabled, name, register } = useSegmentGroup()
  const localRef = useRef<HTMLButtonElement | null>(null)
  const composedRef = (node: HTMLButtonElement | null) => {
    localRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
  }

  useLayoutEffect(() => {
    register(value, localRef.current)
    return () => {
      register(value, null)
    }
  }, [value, register])

  const active = selected === value
  const disabled = groupDisabled || itemDisabled

  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={disabled || undefined}
      data-state={active ? 'on' : 'off'}
      disabled={disabled}
      ref={composedRef}
      onClick={() => !disabled && setValue(value)}
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          if (!disabled) setValue(value)
        }
      }}
      className={cn(
        'relative z-10 inline-flex flex-1 select-none items-center justify-center whitespace-nowrap rounded-lg px-3 font-medium outline-none transition-colors duration-200',
        size === 'xs' && 'text-[11px] px-2',
        size === 'sm' && 'text-xs px-2.5',
        size === 'md' && 'text-sm',
        size === 'lg' && 'text-base px-4',
        'data-[state=off]:text-muted-foreground data-[state=on]:text-primary-foreground data-[state=on]:font-semibold',
        'data-[state=on]:drop-shadow-[0_6px_18px_rgba(59,130,246,0.35)]',
        'focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1',
        disabled && 'opacity-40 pointer-events-none',
        className
      )}
      {...rest}
    >
      {children}
      <input
        type="radio"
        name={name}
        value={value}
        tabIndex={-1}
        className="sr-only"
        checked={active}
        readOnly
        aria-hidden="true"
      />
    </button>
  )
})

// Indicator
interface IndicatorProps extends React.HTMLAttributes<HTMLSpanElement> {}
const Indicator = React.forwardRef<HTMLSpanElement, IndicatorProps>(function SegmentGroupIndicator(
  { className, ...rest },
  ref
) {
  const { value, getRef, size } = useSegmentGroup()
  const indicatorRef = useRef<HTMLSpanElement | null>(null)
  const composedRef = (node: HTMLSpanElement | null) => {
    indicatorRef.current = node
    if (typeof ref === 'function') ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLSpanElement | null>).current = node
  }

  useLayoutEffect(() => {
    if (!indicatorRef.current) return

    let frame: number | null = null
    let observed: HTMLButtonElement | null = null
    let ro: ResizeObserver | null = null

    const update = () => {
      if (frame != null) {
        cancelAnimationFrame(frame)
        frame = null
      }

      const indicatorEl = indicatorRef.current
      if (!indicatorEl) return

      const target = value ? getRef(value) : null
      if (!target) {
        frame = requestAnimationFrame(update)
        return
      }

      if (ro && observed !== target) {
        if (observed) ro.unobserve(observed)
        ro.observe(target)
        observed = target
      }

      const buttonRect = target.getBoundingClientRect()
      const parentRect = target.parentElement?.getBoundingClientRect()
      if (!parentRect) return

      indicatorEl.style.setProperty('--sg-left', `${buttonRect.left - parentRect.left}px`)
      indicatorEl.style.setProperty('--sg-width', `${buttonRect.width}px`)
    }

    ro = new ResizeObserver(() => update())
    update()
    window.addEventListener('resize', update)

    return () => {
      if (frame != null) cancelAnimationFrame(frame)
      if (ro && observed) ro.unobserve(observed)
      ro?.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [value, getRef, size])

  return (
    <span
      ref={composedRef}
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute top-1 bottom-1 z-0 w-[var(--sg-width,0px)] translate-x-[var(--sg-left,0px)] rounded-lg bg-gradient-to-r from-primary/80 via-primary to-primary/80 shadow-[0_10px_30px_rgba(59,130,246,0.35)] ring-1 ring-primary/40 transition-[transform,width] duration-300 ease-out will-change-transform motion-reduce:transition-none',
        className
      )}
      {...rest}
    />
  )
})

// Items shortcut
interface ItemsProps extends React.HTMLAttributes<HTMLElement> {
  items: (string | { label: React.ReactNode; value: string; disabled?: boolean })[]
}
const Items: React.FC<ItemsProps> = ({ items }) => {
  return (
    <>
      {items.map((it) => {
        const obj = typeof it === 'string' ? { label: it, value: it } : it
        return (
          <Item key={obj.value} value={obj.value} disabled={obj.disabled}>
            {obj.label}
          </Item>
        )
      })}
    </>
  )
}

export const SegmentGroup = { Root, Item, Indicator, Items }