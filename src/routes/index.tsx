import { Link, createFileRoute } from "@tanstack/react-router";

import { CRMFrame } from "@/widgets/CRM/CRMFrame";
import { BindWorkspace } from "@/widgets/Workspace";

type CRMId = "adwa" | "whitelabels" | "vortexino";

type HomeSearch = {
  tool?: "crm";
  crm?: CRMId;
};

const CRM_IDS: CRMId[] = ["adwa", "whitelabels", "vortexino"];

export const Route = createFileRoute("/")({
  validateSearch: (search): HomeSearch => {
    const tool = search.tool === "crm" ? "crm" : undefined;
    const crm = CRM_IDS.includes(search.crm as CRMId)
      ? (search.crm as CRMId)
      : undefined;

    return {
      tool,
      crm,
    };
  },
  component: HomePage,
});

function HomePage() {
  const search = Route.useSearch();

  const isCrmWorkspace = search.tool === "crm";

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3">
        <div>
          <h1 className="text-sm font-semibold">
            {isCrmWorkspace ? "CRM Workspace" : "SupportOS Workspace"}
          </h1>

          <p className="text-xs text-muted-foreground">
            {isCrmWorkspace
              ? "CRM opened inside workspace"
              : "Knowledge base and support binds"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to="/"
            search={{
              tool: "crm",
              crm: "adwa",
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            ADWA
          </Link>

          <Link
            to="/"
            search={{
              tool: "crm",
              crm: "whitelabels",
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Whitelabels
          </Link>

          <Link
            to="/"
            search={{
              tool: "crm",
              crm: "vortexino",
            }}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Vortexino
          </Link>

          {isCrmWorkspace ? (
            <Link
              to="/"
              search={{}}
              className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
            >
              Back to binds
            </Link>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {isCrmWorkspace ? (
          <CRMFrame initialCrmId={search.crm} />
        ) : (
          <BindWorkspace />
        )}
      </div>
    </div>
  );
}