-- Migration: Link user_id to messages and room_presence, and create last_watched table

-- 1. Update public.messages
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 2. Update public.room_presence
ALTER TABLE public.room_presence ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

-- 3. Create public.last_watched table
CREATE TABLE IF NOT EXISTS public.last_watched (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    room_code text NOT NULL,
    video_time double precision DEFAULT 0,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT last_watched_pkey PRIMARY KEY (id),
    CONSTRAINT last_watched_user_id_room_code_key UNIQUE (user_id, room_code)
);

-- 4. Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_watched ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

-- 5. Policies for messages
CREATE POLICY "Users can view all messages" ON public.messages FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert their own messages" ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- 6. Policies for room_presence
CREATE POLICY "Users can view all presence" ON public.room_presence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update their own presence" ON public.room_presence FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Policies for last_watched
CREATE POLICY "Users can view their own last watched" ON public.last_watched FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update their own last watched" ON public.last_watched FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8. Policies for rooms
CREATE POLICY "Users can view all rooms" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create rooms" ON public.rooms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Users can update rooms" ON public.rooms FOR UPDATE TO authenticated USING (true);
