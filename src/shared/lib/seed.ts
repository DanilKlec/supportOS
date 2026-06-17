import type { Bind, Category } from '#/types/bind'

export const SEED_CATEGORIES: Category[] = [
  { id: 'cat-greeting', name: 'Приветствие', sortOrder: 0 },
  { id: 'cat-billing', name: 'Оплата', sortOrder: 1 },
  { id: 'cat-tech', name: 'Техподдержка', sortOrder: 2 },
  { id: 'cat-closing', name: 'Завершение', sortOrder: 3 },
]

const now = Date.now()

export const SEED_BINDS: Bind[] = [
  {
    id: 'bind-1',
    categoryId: 'cat-greeting',
    tags: ['welcome', 'first-contact'],
    translations: {
      ru: {
        title: 'Стандартное приветствие',
        command: 'Здравствуйте! Меня зовут {имя}, я специалист поддержки. Чем могу помочь?',
        description: 'Используйте в начале диалога',
        content:
          'Начните диалог с тёплого, профессионального приветствия. Откройте контакт и уточните, чем помочь клиенту.',
        lastModified: now,
      },
      en: {
        title: 'Standard greeting',
        command: 'Hello! My name is {name}, I am a support specialist. How can I help you today?',
        description: 'Use at the start of the conversation',
        content:
          'Begin with a warm, professional greeting. Open the conversation and ask how you can help the customer.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-2',
    categoryId: 'cat-greeting',
    tags: ['repeat', 'returning-client'],
    translations: {
      ru: {
        title: 'Повторное обращение',
        command: 'Рад снова вас видеть! Помню, мы обсуждали {тема}. Продолжим?',
        description: 'Восстановление контекста после перерыва',
        content: 'Напомните клиенту кратко предыдущее обращение и предложите продолжить решение вопроса.',
        lastModified: now,
      },
      en: {
        title: 'Returning customer greeting',
        command: 'Nice to see you again! I remember we discussed {topic}. Shall we continue?',
        description: 'Restore context after a break',
        content: 'Remind the customer of the previous conversation and offer to continue resolving the issue.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-3',
    categoryId: 'cat-billing',
    tags: ['payment', 'status'],
    translations: {
      ru: {
        title: 'Статус оплаты',
        command:
          'Проверил ваш платёж — он прошёл успешно {дата}. Подписка активна до {дата_окончания}.',
        description: 'Ответ на вопрос о платеже',
        content:
          'Сообщите клиенту текущий статус оплаты и дату окончания подписки, чтобы закрыть тему финансового запроса.',
        lastModified: now,
      },
      en: {
        title: 'Payment status',
        command: 'I checked your payment — it was successful on {date}. Your subscription is active until {expiry_date}.',
        description: 'Answer to payment inquiry',
        content:
          'Share the current payment status and expiration date so the financial question is resolved clearly.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-4',
    categoryId: 'cat-billing',
    tags: ['refund', 'billing'],
    translations: {
      ru: {
        title: 'Возврат средств',
        command:
          'Оформил запрос на возврат. Средства поступят на карту в течение 5–10 рабочих дней.',
        description: 'Уведомление о возврате',
        content:
          'Сообщите клиенту о сроках возврата средств и уточните, что заявка оформлена.',
        lastModified: now,
      },
      en: {
        title: 'Refund initiated',
        command: 'I have submitted a refund request. The funds will appear on your card within 5–10 business days.',
        description: 'Refund notification',
        content:
          'Let the customer know the refund timeline and confirm that the request has been submitted.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-5',
    categoryId: 'cat-tech',
    tags: ['restart', 'troubleshooting'],
    translations: {
      ru: {
        title: 'Перезагрузка',
        command:
          'Попробуйте перезагрузить приложение и очистить кэш. Инструкция: Настройки → Хранилище → Очистить кэш.',
        description: 'Базовый шаг по устранению неполадок',
        content: 'Попросите клиента перезапустить приложение и очистить кэш, чтобы исключить временные ошибки.',
        lastModified: now,
      },
      en: {
        title: 'Restart app',
        command:
          'Please try restarting the app and clearing the cache. Go to Settings → Storage → Clear cache.',
        description: 'Basic troubleshooting step',
        content:
          'Ask the customer to restart the application and clear cache to eliminate transient issues.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-6',
    categoryId: 'cat-tech',
    tags: ['escalation', 'l2'],
    translations: {
      ru: {
        title: 'Эскалация в L2',
        command: 'Передал ваш запрос команде разработки. Ожидайте ответ в течение 24 часов.',
        description: 'Переадресация на следующий уровень поддержки',
        content: 'Сообщите клиенту, что его запрос передан в команду разработки с ожиданием ответа в пределах 24 часов.',
        lastModified: now,
      },
      en: {
        title: 'Escalation to L2',
        command: 'I have forwarded your request to the development team. Please expect a response within 24 hours.',
        description: 'Transfer to next support tier',
        content:
          'Let the customer know the request has been escalated and that they should expect a response within 24 hours.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-7',
    categoryId: 'cat-closing',
    tags: ['closing', 'courteous'],
    translations: {
      ru: {
        title: 'Завершение диалога',
        command: 'Рад был помочь! Если возникнут вопросы — обращайтесь. Хорошего дня! 🙂',
        description: 'Завершение разговора клиента',
        content: 'Поблагодарите клиента за обращение и оставьте открытыми дальнейшие контакты.',
        lastModified: now,
      },
      en: {
        title: 'Conversation close',
        command: 'Glad I could help! If you have any more questions, feel free to reach out. Have a great day! 🙂',
        description: 'Close the dialog politely',
        content: 'Thank the customer and leave the door open for future contact.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'bind-8',
    categoryId: 'cat-closing',
    tags: ['feedback', 'rating'],
    translations: {
      ru: {
        title: 'Запрос оценки',
        command: 'Буду благодарен, если оцените качество поддержки после завершения чата.',
        description: 'Просьба оставить отзыв',
        content: 'Попросите клиента оставить отзыв о поддержке, чтобы повысить качество сервиса.',
        lastModified: now,
      },
      en: {
        title: 'Feedback request',
        command: 'I would appreciate it if you could rate the support quality after the chat ends.',
        description: 'Ask for a review',
        content: 'Ask the customer to leave feedback to help improve service quality.',
        lastModified: now,
      },
    },
    createdAt: now,
    updatedAt: now,
  },
]
