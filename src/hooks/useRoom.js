import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { logSyncEvent } from '../utils/syncLogger';

export const useRoom = (roomCode, username, videoFile = null) => {
    const [roomState, setRoomState] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const channelRef = useRef(null);
    const { user } = useAuth();

    // Subscribe to room updates via Broadcast (more reliable than Postgres Changes)
    useEffect(() => {
        if (!roomCode) return;

        let channel;

        const setupSubscription = async () => {
            if (user) {
                // Load initial room state
                const { data, error } = await supabase
                    .from('rooms')
                    .select('*')
                    .eq('room_code', roomCode)
                    .single();

                if (data) {
                    console.log('useRoom: Initial room state loaded:', data);
                    setRoomState(data);

                    // Track last watched
                    await updateLastWatched(roomCode, data.video_time, videoFile);
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
                        await updateLastWatched(roomCode, 0, videoFile);
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
                            await updateLastWatched(roomCode, existingData.video_time, videoFile);
                        } else {
                            console.error('useRoom: Failed to fetch existing room:', fetchError);
                        }
                    } else {
                        console.error('useRoom: Failed to create room:', createError);
                    }
                } else {
                    console.error('useRoom: Failed to load room:', error);
                }
            } else {
                // Guest mode: initialize clean mock state
                console.log('useRoom: Initializing mock room state for guest');
                setRoomState({
                    room_code: roomCode,
                    is_playing: false,
                    video_time: 0,
                    playback_rate: 1.0,
                    last_action_by: username
                });
            }

            // Subscribe to Broadcast messages (works on free tier for both auth and guest users!)
            console.log('useRoom: Setting up Broadcast channel for room:', roomCode);

            channel = supabase
                .channel(`room-${roomCode}`)
                .on('broadcast', { event: 'room-update' }, (payload) => {
                    const data = payload.payload;
                    // Ignore own broadcasts — we already applied this state optimistically
                    if (data.last_action_by === username) return;
                    console.log('useRoom: 🔥 Broadcast received:', data);
                    setRoomState(data);
                })
                .subscribe((status) => {
                    console.log('useRoom: Broadcast status:', status);
                    if (status === 'SUBSCRIBED') {
                        setIsConnected(true);
                        channelRef.current = channel;
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
                channelRef.current = null;
                setIsConnected(false);
            }
        };
    }, [roomCode, user, videoFile]);

    const updateLastWatched = async (code, time, file = null) => {
        if (!user) return;

        const hasVideoInfoSupport = localStorage.getItem('supabase_last_watched_has_video_info') !== 'false';

        const updates = {
            user_id: user.id,
            room_code: code,
            video_time: time,
            updated_at: new Date().toISOString()
        };

        if (hasVideoInfoSupport && file) {
            updates.video_name = file.name;
            if (file.previewUrl) {
                updates.video_path = file.previewUrl.replace('video://', '');
                console.log('useRoom: Saving video path:', updates.video_path);
            }
        }

        let { error } = await supabase
            .from('last_watched')
            .upsert(updates, {
                onConflict: 'user_id,room_code'
            });

        // Fallback for database schema cache discrepancy (missing columns)
        if (error && error.code === 'PGRST204') {
            console.warn('useRoom: last_watched table is missing video_name/video_path columns. Caching support status locally.');
            localStorage.setItem('supabase_last_watched_has_video_info', 'false');

            const fallbackUpdates = {
                user_id: user.id,
                room_code: code,
                video_time: time,
                updated_at: new Date().toISOString()
            };
            const { error: fallbackError } = await supabase
                .from('last_watched')
                .upsert(fallbackUpdates, {
                    onConflict: 'user_id,room_code'
                });
            error = fallbackError;
        }

        if (error) {
            console.error('useRoom: Error updating last_watched:', error);
        }
    };

    // Update room state and broadcast to all clients
    const updateRoom = useCallback(async (updates) => {
        if (!roomCode) return;

        console.log('useRoom: Updating room and broadcasting:', updates);
        
        // 1. Prepare optimistic payload immediately
        const optimisticData = {
            ...roomState,
            ...updates,
            last_action_by: username,
            updated_at: new Date().toISOString()
        };

        // 2. Update local state immediately for better responsiveness
        setRoomState(optimisticData);

        // 3. Broadcast to all connected clients BEFORE database update
        try {
            const targetChannel = channelRef.current || supabase.channel(`room-${roomCode}`);
            await targetChannel.send({
                type: 'broadcast',
                event: 'room-update',
                payload: optimisticData
            });
            console.log('useRoom: ✅ Broadcast sent to all clients (Low Latency)');
        } catch (err) {
            console.error('useRoom: ❌ Broadcast failed:', err);
            logSyncEvent(roomCode, username, 'BROADCAST_ERROR', optimisticData.video_time, optimisticData.video_time, err.message);
        }

        // 4. Update last watched if time changed significantly
        if (user && updates.video_time !== undefined) {
            updateLastWatched(roomCode, updates.video_time, videoFile);
        }

        // 5. Update database asynchronously
        if (user) {
            supabase
                .from('rooms')
                .update({
                    ...updates,
                    last_action_by: username,
                    updated_at: new Date().toISOString()
                })
                .eq('room_code', roomCode)
                .then(({ error }) => {
                    if (error) {
                        console.error('useRoom: ❌ Database update failed:', error);
                        logSyncEvent(roomCode, username, 'DB_UPDATE_ERROR', optimisticData.video_time, optimisticData.video_time, error.message);
                    } else {
                        console.log('useRoom: ✅ Database updated (Async)');
                    }
                });
        }
    }, [roomCode, username, user, videoFile, roomState]);

    return { roomState, updateRoom, isConnected };
};
