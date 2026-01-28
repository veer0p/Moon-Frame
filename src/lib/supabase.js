import { createClient } from '@supabase/supabase-js';

// TODO: Replace these with your actual Supabase credentials
// Get these from: Supabase Dashboard → Settings → API
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log('Supabase Config:', {
    url: SUPABASE_URL ? 'Set' : 'Missing',
    key: SUPABASE_ANON_KEY ? 'Set' : 'Missing'
});

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('CRITICAL: Supabase environment variables are missing!');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
