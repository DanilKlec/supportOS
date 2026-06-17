import { useToast } from '#/shared/hooks/useToast'

export function ToastContainer() {
  const { toasts } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="rounded-lg bg-surface-elevated px-4 py-2.5 text-sm text-foreground shadow-lg border border-border animate-slide-up"
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}
