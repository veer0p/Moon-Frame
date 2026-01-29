import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const usePresence = (roomCode, username) => {
    const [activeUsers, setActiveUsers] = useState([]);
    const [userCount, setUserCount] = useState(0);
    const { user } = useAuth();

    useEffect(() => {
        if (!roomCode || !username || !user) return;

        let heartbeatInterval;
        let channel;

        const setupPresence = async () => {
            // Insert or update presence
            const { error } = await supabase
                .from('room_presence')
                .upsert({
                    room_code: roomCode,
                    username,
                    user_id: user.id,
                    last_seen: new Date().toISOString(),
                    is_active: true
                }, {
                    onConflict: 'room_code,username'
                });

            if (error) {
                console.error('usePresence: Error setting presence:', error);
            } else {
                console.log('usePresence: Presence set for', username);
            }

            // Load active users
            await loadActiveUsers();

            // Set up heartbeat (every 5 seconds)
            heartbeatInterval = setInterval(async () => {
                await supabase
                    .from('room_presence')
                    .update({
                        last_seen: new Date().toISOString(),
                        is_active: true
                    })
                    .eq('room_code', roomCode)
                    .eq('username', username)
                    .eq('user_id', user.id);
            }, 5000);

            // Subscribe to presence changes via Broadcast
            channel = supabase
                .channel(`presence-${roomCode}`)
                .on('broadcast', { event: 'presence-update' }, () => {
                    console.log('usePresence: Presence update received');
                    loadActiveUsers();
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('usePresence: ✅ Subscribed to presence channel');
                    }
                });
        };

        const loadActiveUsers = async () => {
            // Clean up stale users first (inactive for >30 seconds)
            await supabase
                .from('room_presence')
                .update({ is_active: false })
                .eq('room_code', roomCode)
                .lt('last_seen', new Date(Date.now() - 30000).toISOString());

            // Load active users
            const { data, error } = await supabase
                .from('room_presence')
                .select('*')
                .eq('room_code', roomCode)
                .eq('is_active', true)
                .order('created_at', { ascending: true });

            if (data) {
                setActiveUsers(data);
                setUserCount(data.length);
                console.log('usePresence: Active users:', data.length);
            }
        };

        setupPresence();

        // Cleanup on unmount
        return () => {
            if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
            }
            if (channel) {
                supabase.removeChannel(channel);
            }
            // Mark as inactive
            supabase
                .from('room_presence')
                .update({ is_active: false })
                .eq('room_code', roomCode)
                .eq('username', username)
                .eq('user_id', user.id)
                .then(() => {
                    console.log('usePresence: Marked as inactive');
                    // Broadcast presence change
                    const broadcastChannel = supabase.channel(`presence-${roomCode}`);
                    broadcastChannel.send({
                        type: 'broadcast',
                        event: 'presence-update',
                        payload: { username, action: 'left' }
                    });
                });
        };
    }, [roomCode, username, user]);

    const broadcastPresence = useCallback(async () => {
        const channel = supabase.channel(`presence-${roomCode}`);
        await channel.send({
            type: 'broadcast',
            event: 'presence-update',
            payload: { username, action: 'update' }
        });
    }, [roomCode, username]);

    return { activeUsers, userCount, broadcastPresence };
};
