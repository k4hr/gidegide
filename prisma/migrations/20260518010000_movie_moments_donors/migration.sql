DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'MOVIE_MOMENTS'
      AND enumtypid = to_regtype('"FactoryDonorKind"')
  ) THEN
    ALTER TYPE "FactoryDonorKind" ADD VALUE 'MOVIE_MOMENTS';
  END IF;
END $$;
