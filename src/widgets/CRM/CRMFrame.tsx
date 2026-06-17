import { useEffect, useMemo, useState } from "react";

const CRM_ADWA_URL: string = import.meta.env.VITE_CRM_ADWA_URL || "";

const CRM_WHITELABELS_URL: string =
    import.meta.env.VITE_CRM_WHITELABELS_URL ||
    import.meta.env.VITE_CRM_WHITELABLES_URL ||
    "";

const CRM_VORTEXINO_URL: string = import.meta.env.VITE_CRM_VORTEXINO_URL || "";

type CRMId = "adwa" | "whitelabels" | "vortexino";

type CRMItem = {
    id: CRMId;
    title: string;
    url: string;
};

type CRMFrameProps = {
    initialCrmId?: CRMId;
};

const CRM_ITEMS: CRMItem[] = [
    {
        id: "adwa",
        title: "CRM ADWA",
        url: CRM_ADWA_URL,
    },
    {
        id: "whitelabels",
        title: "CRM Whitelabels",
        url: CRM_WHITELABELS_URL,
    },
    {
        id: "vortexino",
        title: "CRM Vortexino",
        url: CRM_VORTEXINO_URL,
    },
];

export function CRMFrame({ initialCrmId }: CRMFrameProps) {
    const crms = useMemo<CRMItem[]>(
        () => CRM_ITEMS.filter((crm) => crm.url.trim().length > 0),
        [],
    );

    const [activeCrmId, setActiveCrmId] = useState<CRMId | "">(
        initialCrmId || crms[0]?.id || "",
    );

    useEffect(() => {
        if (initialCrmId) {
            setActiveCrmId(initialCrmId);
        }
    }, [initialCrmId]);

    const activeCrm = crms.find((crm) => crm.id === activeCrmId) || crms[0];

    if (crms.length === 0) {
        return (
            <div className="flex h-full items-center justify-center bg-background text-foreground">
                <div className="rounded-xl border border-border bg-surface p-6">
                    <h1 className="text-xl font-semibold">CRM URLs are not configured</h1>

                    <p className="mt-2 text-sm text-muted-foreground">
                        Add CRM URLs to your .env file.
                    </p>

                    <pre className="mt-4 rounded-lg border border-border bg-background p-4 text-xs text-muted-foreground">
                        {`VITE_CRM_ADWA_URL=https://...
VITE_CRM_WHITELABELS_URL=https://...
VITE_CRM_VORTEXINO_URL=https://...`}
                    </pre>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
            <div className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
                <div className="min-w-0">
                    <h1 className="text-sm font-semibold">{activeCrm.title}</h1>
                    <p className="truncate text-xs text-muted-foreground">{activeCrm.url}</p>
                </div>

                <button
                    type="button"
                    onClick={() => window.open(activeCrm.url, "_blank", "noopener,noreferrer")}
                    className="shrink-0 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"
                >
                    Open in browser
                </button>
            </div>

            <div className="flex gap-2 border-b border-border bg-surface px-4 py-2">
                {crms.map((crm) => {
                    const active = crm.id === activeCrm.id;

                    return (
                        <button
                            key={crm.id}
                            type="button"
                            onClick={() => setActiveCrmId(crm.id)}
                            className={[
                                "rounded-lg px-3 py-2 text-sm font-medium transition",
                                active
                                    ? "bg-primary text-primary-foreground"
                                    : "border border-border bg-background text-muted-foreground hover:bg-surface-hover hover:text-foreground",
                            ].join(" ")}
                        >
                            {crm.title}
                        </button>
                    );
                })}
            </div>

            <iframe
                key={activeCrm.id}
                src={activeCrm.url}
                title={activeCrm.title}
                className="h-full w-full flex-1 border-0 bg-white"
                allow="clipboard-read; clipboard-write; fullscreen"
            />
        </div>
    );
}