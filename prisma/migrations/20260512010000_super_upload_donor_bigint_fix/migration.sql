-- Fix YouTube donor channel counters for large channels.
-- YouTube can return values greater than INT4 max (2,147,483,647).
ALTER TABLE "FactoryDonorChannel"
  ALTER COLUMN "subscriberCount" TYPE BIGINT USING "subscriberCount"::BIGINT;

ALTER TABLE "FactoryDonorChannel"
  ALTER COLUMN "videoCount" TYPE BIGINT USING "videoCount"::BIGINT;

ALTER TABLE "FactoryDonorChannel"
  ALTER COLUMN "viewCount" TYPE BIGINT USING "viewCount"::BIGINT;
