export const FACTORY_CONFIG = {
  telegramStatusLimit: 10,
  telegramQueueLimit: 20,
  instagramScanOnAddLimit: 50,
} as const;

export type FactoryConfig = typeof FACTORY_CONFIG;
