import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://paxkzngtbtivihopesve.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBheGt6bmd0YnRpdmlob3Blc3ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjcxOTQ3NDQsImV4cCI6MjA4Mjc3MDc0NH0.-JmH7MlqKc5hPjW0c7Q3vINuKIbKPU8qgW-gqpwZcj4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testInsert() {
    const { data, error } = await supabase
        .from('sync_logs')
        .insert({
            room_code: 'TEST_ROOM',
            username: 'TestUser',
            action_type: 'TEST_LOG',
            local_time: 0,
            remote_time: 0,
            message: 'Testing if inserts work'
        });

    if (error) {
        console.error('Insert failed with error:', error);
    } else {
        console.log('Insert succeeded! Data:', data);
    }
}

testInsert();
