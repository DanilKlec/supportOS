import { ArrowRight, Clock, Edit2, Star, Terminal, Zap } from 'lucide-react'
import { copyToClipboard } from '#/shared/lib/clipboard'
import { useToast } from '#/shared/hooks/useToast'
import { SUPPORTED_LANGUAGES } from '#/shared/lib/languages'
import type { Bind } from '#/types/bind'

interface BindEditorProps {
  bind?: Bind
}

export function BindEditor({ bind }: BindEditorProps) {
  const { showToast } = useToast()

  if (!bind) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-3xl border border-border bg-surface p-8 text-center">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-surface-elevated text-accent">
          <ArrowRight size={20} />
        </div>
        <h2 className="text-2xl font-semibold text-foreground mb-2">Select a bind to open</h2>
        <p className="text-sm text-muted max-w-md">
          Use the Knowledge tree or workspace modes to choose a bind. The editor will stay open while you browse.
        </p>
      </div>
    )
  }

  const handleCopy = async (text: string) => {
    const ok = await copyToClipboard(text)
    if (ok) {
      showToast('Copied to clipboard')
    } else {
      showToast('Copy failed')
    }
  }

  return (
    <div className="flex h-full flex-col rounded-3xl border border-border bg-surface p-6">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
          
            {bind.tags.length > 0 && (
              <span className="rounded-full bg-surface-elevated px-3 py-1 text-xs text-muted">
                {bind.tags.join(', ')}
              </span>
            )}
          </div>
        
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            <Terminal size={16} />
            Copy current
          </button>
          <button
            type="button"
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors `}
          >
            <Star size={16} />
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-surface-elevated px-4 py-2 text-sm font-medium text-foreground hover:bg-surface transition-colors"
          >
            <Edit2 size={16} />
            Edit
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-surface-elevated px-4 py-2 text-sm font-medium text-muted hover:bg-surface transition-colors"
          >
            <Clock size={16} />
            History
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-surface-elevated px-4 py-2 text-sm font-medium text-muted hover:bg-surface transition-colors"
          >
            <Zap size={16} />
            AI
          </button>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,200px)]">
        <div className="space-y-3 rounded-3xl border border-border bg-surface-elevated p-4">
          <h2 className="text-sm font-semibold text-foreground">Language preview</h2>
          <div className="flex flex-wrap gap-2">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                className={`rounded-full px-3 py-2 text-sm font-medium transition-colors`}
              >
                {language.flag} {language.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-3xl border border-border bg-surface-elevated p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">Quick copy</h2>
            <span className="text-xs uppercase tracking-[0.18em] text-muted">Every language</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {SUPPORTED_LANGUAGES.map((language) => (
              <button
                key={language.code}
                type="button"
                onClick={() => handleCopy(bind.translations[language.code]?.command || bind.translations[language.code]?.content || '')}
                disabled={!bind.translations[language.code]}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-left text-foreground transition-colors disabled:cursor-not-allowed disabled:opacity-50 hover:bg-surface"
              >
                <div className="font-medium">Copy {language.code.toUpperCase()}</div>
                <div className="text-xs text-muted">{bind.translations[language.code]?.title || 'No translation'}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden rounded-3xl border border-border bg-background p-6">
        </div>
    </div>
  )
}
