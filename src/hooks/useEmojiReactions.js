import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

export const useEmojiReactions = (roomCode) => {
    const [showerEmojis, setShowerEmojis] = useState([]); // Active emoji showers on screen
    const channelRef = useRef(null);
    const idCounter = useRef(0);

    useEffect(() => {
        if (!roomCode) return;

        // Subscribe to emoji broadcast
        const channel = supabase
            .channel(`emoji-${roomCode}`)
            .on('broadcast', { event: 'emoji-reaction' }, (payload) => {
                triggerShower(payload.payload.emoji, false);
            })
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    channelRef.current = channel;
                }
            });

        return () => {
            supabase.removeChannel(channel);
            channelRef.current = null;
        };
    }, [roomCode]);

    const triggerShower = useCallback((emoji, broadcast = true) => {
        // Generate shower particles
        const particleCount = 30;
        const newParticles = [];

        for (let i = 0; i < particleCount; i++) {
            idCounter.current += 1;
            newParticles.push({
                id: idCounter.current,
                emoji,
                left: Math.random() * 100,           // % from left
                delay: Math.random() * 0.8,           // stagger start
                duration: 2 + Math.random() * 2,      // fall speed
                size: 1.2 + Math.random() * 1.8,      // scale
                rotation: Math.random() * 360,         // initial rotation
                rotationSpeed: -180 + Math.random() * 360, // spin
                wobble: -30 + Math.random() * 60,      // horizontal drift
            });
        }

        setShowerEmojis(prev => [...prev, ...newParticles]);

        // Auto-remove particles after animation completes
        setTimeout(() => {
            const ids = new Set(newParticles.map(p => p.id));
            setShowerEmojis(prev => prev.filter(p => !ids.has(p.id)));
        }, 5000);

        // Broadcast to other users
        if (broadcast && channelRef.current) {
            channelRef.current.send({
                type: 'broadcast',
                event: 'emoji-reaction',
                payload: { emoji }
            });
        }
    }, []);

    return { showerEmojis, triggerShower };
};
