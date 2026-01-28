import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export const useRoom = (roomCode, username) => {
    const [roomState, setRoomState] = useState(null);
    const [isConnected, setIsConnected] = useState(false);

    // Subscribe to room updates via Broadcast (more reliable than Postgres Changes)
    useEffect(() => {
        if (!roomCode) return;

        let channel;

        const setupSubscription = async () => {
            // Load initial room state
            const { data, error } = await supabase
                .from('rooms')
                .select('*')
                .eq('room_code', roomCode)
                .single();

            if (data) {
                console.log('useRoom: Initial room state loaded:', data);
                setRoomState(data);
            } else if (error && error.code === 'PGRST116') {
                console.log('useRoom: Room not found, creating it:', roomCode);
                // Room doesn't exist, create it
                const { data: newData, error: createError } = await supabase
                    .from('rooms')
                    .insert({
                        room_code: roomCode,
                        is_playing: false,
                        video_time: 0,
                        playback_rate: 1.0,
                        last_action_by: username
                    })
                    .select()
                    .single();

                if (newData) {
                    console.log('useRoom: Room created successfully:', newData);
                    setRoomState(newData);
                } else if (createError && createError.code === '23505') {
                    // Room already exists (race condition), fetch it
                    console.log('useRoom: Room already exists, fetching it...');
                    const { data: existingData, error: fetchError } = await supabase
                        .from('rooms')
                        .select('*')
                        .eq('room_code', roomCode)
                        .single();

                    if (existingData) {
                        setRoomState(existingData);
                    } else {
                        console.error('useRoom: Failed to fetch existing room:', fetchError);
                    }
                } else {
                    console.error('useRoom: Failed to create room:', createError);
                }
            } else {
                console.error('useRoom: Failed to load room:', error);
            }

            // Subscribe to Broadcast messages (works on free tier!)
            console.log('useRoom: Setting up Broadcast channel for room:', roomCode);

            channel = supabase
                .channel(`room-${roomCode}`)
                .on('broadcast', { event: 'room-update' }, (payload) => {
                    console.log('useRoom: 🔥 Broadcast received:', payload.payload);
                    setRoomState(payload.payload);
                })
                .subscribe((status) => {
                    console.log('useRoom: Broadcast status:', status);
                    if (status === 'SUBSCRIBED') {
                        setIsConnected(true);
                        console.log('useRoom: ✅ Broadcast channel connected:', roomCode);
                    } else if (status === 'CHANNEL_ERROR') {
                        console.error('useRoom: ❌ Broadcast connection failed');
                        setIsConnected(false);
                    }
                });
        };

        setupSubscription();

        return () => {
            if (channel) {
                console.log('useRoom: Closing Broadcast channel');
                supabase.removeChannel(channel);
                setIsConnected(false);
            }
        };
    }, [roomCode]);

    // Update room state and broadcast to all clients
    const updateRoom = useCallback(async (updates) => {
        if (!roomCode) return;

        console.log('useRoom: Updating room and broadcasting:', updates);

        // Update database
        const { data, error } = await supabase
            .from('rooms')
            .update({
                ...updates,
                last_action_by: username,
                updated_at: new Date().toISOString()
            })
            .eq('room_code', roomCode)
            .select()
            .single();

        if (error) {
            console.error('useRoom: ❌ Update failed:', error);
            return;
        }

        console.log('useRoom: ✅ Database updated');

        // Broadcast to all connected clients
        const channel = supabase.channel(`room-${roomCode}`);
        await channel.send({
            type: 'broadcast',
            event: 'room-update',
            payload: data
        });

        console.log('useRoom: ✅ Broadcast sent to all clients');
    }, [roomCode, username]);

    return { roomState, updateRoom, isConnected };
};
