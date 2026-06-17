import type { ReactNode } from "react";

interface WorkspaceProps {
  children: ReactNode;
}

export function Workspace({ children }: WorkspaceProps) {
  return (
    <main className="flex-1 overflow-hidden bg-background">

      <div className="flex h-full flex-col">

        {/* Tabs */}
        <div className="flex h-11 items-center border-b border-border bg-surface px-4">

          <div className="rounded-md bg-accent/10 px-3 py-1 text-sm font-medium text-accent">
            Home
          </div>

        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">

          {children}

        </div>

      </div>

    </main>
  );
}