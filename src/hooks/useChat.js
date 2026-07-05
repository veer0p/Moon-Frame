import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export const useChat = (roomCode) => {
    const [messages, setMessages] = useState([]);
    const { user } = useAuth();

    useEffect(() => {
        if (!roomCode) return;

        let channel;

        const setupChat = async () => {
            // Load existing messages
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('room_code', roomCode)
                .order('created_at', { ascending: true });

            if (data) {
                setMessages(data);
            }

            // Subscribe to new messages via Broadcast
            console.log('useChat: Setting up Broadcast channel for chat:', roomCode);

            channel = supabase
                .channel(`chat-${roomCode}`)
                .on('broadcast', { event: 'new-message' }, (payload) => {
                    console.log('useChat: 🔥 New message received:', payload.payload);
                    // Avoid duplicates - check if message already exists
                    setMessages((prev) => {
                        const exists = prev.some(msg => msg.id === payload.payload.id);
                        if (exists) {
                            console.log('useChat: Message already exists, skipping');
                            return prev;
                        }
                        return [...prev, payload.payload];
                    });
                })
                .subscribe((status) => {
                    if (status === 'SUBSCRIBED') {
                        console.log('useChat: ✅ Chat channel connected:', roomCode);
                    }
                });
        };

        setupChat();

        return () => {
            if (channel) {
                supabase.removeChannel(channel);
            }
        };
    }, [roomCode]);

    const sendMessage = useCallback(async (username, text) => {
        if (!roomCode || !text.trim()) return;

        let data = null;

        if (user) {
            // Insert into database
            const { data: dbData, error } = await supabase
                .from('messages')
                .insert({
                    room_code: roomCode,
                    username,
                    message: text.trim(),
                    user_id: user.id
                })
                .select()
                .single();

            if (error) {
                console.error('useChat: Error sending message:', error);
            } else {
                console.log('useChat: Message saved to database');
                data = dbData;
            }
        }

        // Fallback for guest mode / database insertion error
        if (!data) {
            data = {
                id: Math.random().toString(36).substr(2, 9),
                room_code: roomCode,
                username,
                message: text.trim(),
                created_at: new Date().toISOString(),
                user_id: null
            };
        }

        // Add message to local state immediately
        setMessages((prev) => [...prev, data]);

        // Broadcast to all clients
        const channel = supabase.channel(`chat-${roomCode}`);
        await channel.send({
            type: 'broadcast',
            event: 'new-message',
            payload: data
        });

        console.log('useChat: ✅ Message broadcast sent');
    }, [roomCode, user]);


    return { messages, sendMessage };
};
