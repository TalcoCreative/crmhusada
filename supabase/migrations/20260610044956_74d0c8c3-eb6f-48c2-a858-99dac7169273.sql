
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- Allow any authenticated user (agents) to update their own last_seen_at via update policy already exists for self.
-- Add an index for fast online lookups
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON public.profiles(last_seen_at DESC);
