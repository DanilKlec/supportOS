import { Upload } from 'lucide-react'
import { useRef } from 'react'

export function ImportButton() {
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg bg-surface-elevated px-3 py-1.5 text-sm text-muted hover:text-foreground hover:bg-surface transition-colors"
        title="Import from CSV file"
      >
        <Upload size={16} />
        <span className="hidden sm:inline">Import</span>
      </button>
    </>
  )
}
