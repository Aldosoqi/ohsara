-- Create table to persist video processing results and support resuming after navigation/refresh
CREATE TABLE IF NOT EXISTS public.video_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  youtube_url TEXT NOT NULL,
  title TEXT,
  thumbnail TEXT,
  analysis TEXT,
  extracted_content TEXT,
  transcript JSONB,
  status TEXT NOT NULL DEFAULT 'processing',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.video_analyses ENABLE ROW LEVEL SECURITY;

-- Policies: owner-only access
CREATE POLICY "Users can view their own analyses"
ON public.video_analyses
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own analyses"
ON public.video_analyses
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own analyses"
ON public.video_analyses
FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger to auto-update updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_video_analyses_updated_at'
  ) THEN
    CREATE TRIGGER update_video_analyses_updated_at
    BEFORE UPDATE ON public.video_analyses
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;

-- Give new users 5 default credits (future inserts)
ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 5;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_video_analyses_user_url ON public.video_analyses (user_id, youtube_url, created_at DESC);
