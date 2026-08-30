-- Additive, nullable profile fields. Safe to apply without rewriting existing users.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "avatar_url" TEXT,
  ADD COLUMN IF NOT EXISTS "birth_date" DATE;
