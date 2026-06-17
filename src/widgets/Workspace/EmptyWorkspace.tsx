import { BookOpen } from "lucide-react";

export function EmptyWorkspace() {
  return (
    <div className="flex flex-1 items-center justify-center">

      <div className="text-center">

        <BookOpen
          size={70}
          className="mx-auto mb-6 opacity-50"
        />

        <h1 className="text-4xl font-bold">
          SupportOS
        </h1>

        <p className="mt-4 text-muted">

          Select a bind from the sidebar

        </p>

        <div className="mt-10 rounded-xl border border-border bg-surface px-6 py-3 inline-block">

          Ctrl + K

        </div>

      </div>

    </div>
  );
}