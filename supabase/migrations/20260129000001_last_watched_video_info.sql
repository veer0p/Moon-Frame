-- Migration: Add video info to last_watched table
ALTER TABLE public.last_watched ADD COLUMN IF NOT EXISTS video_name text;
ALTER TABLE public.last_watched ADD COLUMN IF NOT EXISTS video_path text;
