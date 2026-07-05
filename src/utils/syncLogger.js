import { supabase } from '../lib/supabase';

export const logSyncEvent = async (roomCode, username, actionType, localTime, remoteTime, message) => {
    if (!roomCode || !username) return;
    
    try {
        await supabase.from('sync_logs').insert({
            room_code: roomCode,
            username: username,
            action_type: actionType,
            local_time: localTime,
            remote_time: remoteTime,
            message: message
        });
        console.log(`[Sync Log] ${actionType}: ${message}`);
    } catch (err) {
        console.error('Failed to log sync event:', err);
    }
};
