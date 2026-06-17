import type { KnowledgeCategory } from "../types";

export const mockCategories: KnowledgeCategory[] = [
  {
    id: "verification",
    name: "Verification",
    icon: "Shield",
    color: "#3B82F6",
    order: 1,
  },
  {
    id: "payments",
    name: "Payments",
    icon: "Wallet",
    color: "#10B981",
    order: 2,
  },
  {
    id: "bonuses",
    name: "Bonuses",
    icon: "Gift",
    color: "#F59E0B",
    order: 3,
  },
  {
    id: "technical",
    name: "Technical",
    icon: "Cpu",
    color: "#8B5CF6",
    order: 4,
  },
  {
    id: "responsible-gaming",
    name: "Responsible Gaming",
    icon: "HeartHandshake",
    color: "#EF4444",
    order: 5,
  },
];