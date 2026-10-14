import { createFileRoute } from "@tanstack/react-router";
import { QCWorkspace } from "@/features/qc/QCWorkspace";
export const Route = createFileRoute("/qc")({ component: QCWorkspace });
