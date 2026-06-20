ALTER TABLE "FactoryVkAutoSource"
ALTER COLUMN "timezone" SET DEFAULT 'Europe/Moscow';

UPDATE "FactoryVkAutoSource"
SET "timezone" = 'Europe/Moscow'
WHERE "timezone" = 'America/New_York';
