import { Search, X } from 'lucide-react'
import { useEffect, useRef } from 'react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="relative">
      <Search
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
      />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск биндов… ( / )"
        className="w-full rounded-xl border border-border bg-surface-elevated py-2.5 pl-10 pr-10 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
        >
          <X size={16} />
        </button>
      )}
    </div>
  )
}
