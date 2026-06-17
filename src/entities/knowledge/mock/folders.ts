import type { KnowledgeFolder } from "../types";

export const mockFolders: KnowledgeFolder[] = [
  {
    id: "auto-kyc",
    categoryId: "verification",
    name: "Auto KYC",
    order: 1,
  },
  {
    id: "manual-kyc",
    categoryId: "verification",
    name: "Manual Verification",
    order: 2,
  },
  {
    id: "withdrawals",
    categoryId: "payments",
    name: "Withdrawals",
    order: 1,
  },
  {
    id: "deposits",
    categoryId: "payments",
    name: "Deposits",
    order: 2,
  },
  {
    id: "cashback",
    categoryId: "bonuses",
    name: "Cashback",
    order: 1,
  },
  {
    id: "provider",
    categoryId: "technical",
    name: "Provider Issues",
    order: 1,
  },
];