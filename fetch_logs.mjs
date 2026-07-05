import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://paxkzngtbtivihopesve.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheGt6bmd0YnRpdmlob3Blc3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTQ3NDQsImV4cCI6MjA4Mjc3MDc0NH0.-JmH7MlqKc5hPjW0c7Q3vINuKIbKPU8qgW-gqpwZcj4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchLogs() {
    // Try to authenticate as a dummy user
    const { data: authData, error: authError } = await supabase.auth.signUp({
        email: 'test_logger_123@example.com',
        password: 'password123'
    });

    if (authError && authError.message.includes('already registered')) {
        await supabase.auth.signInWithPassword({
            email: 'test_logger_123@example.com',
            password: 'password123'
        });
    }

    const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }

    if (!data || data.length === 0) {
        console.log('No logs found.');
        return;
    }

    console.log('--- RECENT SYNC LOGS ---');
    data.reverse().forEach(log => {
        console.log(`[${new Date(log.created_at).toLocaleTimeString()}] Room: ${log.room_code} | User: ${log.username} | Action: ${log.action_type}`);
        console.log(`  Local Time: ${log.local_time?.toFixed(2)}s | Remote Time: ${log.remote_time?.toFixed(2)}s`);
        console.log(`  Message: ${log.message}`);
        console.log('------------------------');
    });
}

fetchLogs();
