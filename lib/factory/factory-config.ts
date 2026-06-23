export const FACTORY_CONFIG = {
  telegramStatusLimit: 10,
  telegramQueueLimit: 20,
  // Первый скан при добавлении источника должен быть достаточно глубоким,
  // иначе аккаунты с 1000 публикациями выглядят пустыми после первых 20 дублей.
  instagramScanOnAddLimit: 300,
  instagramDeepScanLimit: 1000,
} as const;

export type FactoryConfig = typeof FACTORY_CONFIG;
