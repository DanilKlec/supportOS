import type { Bind } from "@/entities/bind";

export const mockBinds: Bind[] = [
  {
    id: "waiting-docs",

    slug: "waiting-docs",

    categoryId: "verification",

    folderId: "auto-kyc",

    tags: ["verification"],

    favorite: false,

    archived: false,

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),

    translations: [
      {
        language: "en",
        title: "Waiting Documents",
        content:
          "Please upload the requested documents to complete verification.",
        updatedAt: new Date().toISOString(),
      },
      {
        language: "ru",
        title: "Ожидание документов",
        content:
          "Пожалуйста, загрузите необходимые документы для завершения верификации.",
        updatedAt: new Date().toISOString(),
      },
    ],
  },

  {
    id: "withdrawal-provider",

    slug: "withdrawal-provider",

    categoryId: "payments",

    folderId: "withdrawals",

    tags: ["withdrawal"],

    favorite: true,

    archived: false,

    createdAt: new Date().toISOString(),

    updatedAt: new Date().toISOString(),

    translations: [
      {
        language: "en",
        title: "Provider Check",
        content:
          "Your gaming session has been sent to the provider for review.",
        updatedAt: new Date().toISOString(),
      },
      {
        language: "ru",
        title: "Проверка провайдером",
        content:
          "Ваша игровая сессия была отправлена провайдеру на проверку.",
        updatedAt: new Date().toISOString(),
      },
    ],
  },
];