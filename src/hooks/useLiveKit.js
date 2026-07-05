import { useEffect, useState, useCallback, useRef } from 'react';
import { Room, RoomEvent } from 'livekit-client';
import { supabase } from '../lib/supabase';

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'wss://livekit.viransi.in';

export const useLiveKit = (roomCode, username) => {
    const [room, setRoom] = useState(null);
    const [participants, setParticipants] = useState([]);
    const [localParticipant, setLocalParticipant] = useState(null);
    const [connectionState, setConnectionState] = useState('disconnected');
    const [isMicEnabled, setIsMicEnabled] = useState(false);
    const [isCamEnabled, setIsCamEnabled] = useState(false);
    const [isScreenSharing, setIsScreenSharing] = useState(false);

    // Keep active room in a ref for cleanup
    const activeRoomRef = useRef(null);

    const disconnect = useCallback(async () => {
        const activeRoom = activeRoomRef.current;
        if (activeRoom) {
            console.log('useLiveKit: Disconnecting room...');
            activeRoom.disconnect();
            activeRoomRef.current = null;
        }
        setRoom(null);
        setParticipants([]);
        setLocalParticipant(null);
        setConnectionState('disconnected');
        setIsMicEnabled(false);
        setIsCamEnabled(false);
        setIsScreenSharing(false);
    }, []);

    const connect = useCallback(async () => {
        if (!roomCode || !username) return;

        // Clean up previous room if any
        await disconnect();

        console.log(`useLiveKit: Connecting user ${username} to room ${roomCode}...`);
        setConnectionState('connecting');

        try {
            // Get user session to pass authenticated token to function if logged in
            const { data: { session } } = await supabase.auth.getSession();
            const invokeHeaders = {};
            if (session) {
                invokeHeaders.Authorization = `Bearer ${session.access_token}`;
            }

            // Fetch JWT
            const { data, error } = await supabase.functions.invoke('livekit-token', {
                body: { roomName: roomCode, participantName: username },
                headers: invokeHeaders
            });


            if (error || !data?.token) {
                throw new Error(error?.message || "Failed to fetch LiveKit room token");
            }

            const r = new Room({
                adaptiveStream: true,
                dynacast: true,
            });

            activeRoomRef.current = r;

            const updateParticipants = () => {
                setParticipants(Array.from(r.remoteParticipants.values()));
                setLocalParticipant(r.localParticipant);
                setIsMicEnabled(r.localParticipant?.isMicrophoneEnabled || false);
                setIsCamEnabled(r.localParticipant?.isCameraEnabled || false);
                setIsScreenSharing(r.localParticipant?.isScreenShareEnabled || false);
            };

            r.on(RoomEvent.Connected, () => {
                setConnectionState('connected');
                updateParticipants();
            });

            r.on(RoomEvent.Disconnected, () => {
                setConnectionState('disconnected');
                setParticipants([]);
                setLocalParticipant(null);
            });

            r.on(RoomEvent.Reconnecting, () => setConnectionState('reconnecting'));
            r.on(RoomEvent.Reconnected, () => setConnectionState('connected'));

            // Listen for changes
            r.on(RoomEvent.ParticipantConnected, updateParticipants);
            r.on(RoomEvent.ParticipantDisconnected, updateParticipants);
            r.on(RoomEvent.TrackPublished, updateParticipants);
            r.on(RoomEvent.TrackUnpublished, updateParticipants);
            r.on(RoomEvent.TrackSubscribed, updateParticipants);
            r.on(RoomEvent.TrackUnsubscribed, updateParticipants);
            r.on(RoomEvent.LocalTrackPublished, updateParticipants);
            r.on(RoomEvent.LocalTrackUnpublished, updateParticipants);

            await r.connect(LIVEKIT_URL, data.token);
            setRoom(r);

            // Initialize both audio/video as muted/disabled by default
            await r.localParticipant.setMicrophoneEnabled(false);
            await r.localParticipant.setCameraEnabled(false);
            
            updateParticipants();
            console.log('useLiveKit: Connected successfully');

        } catch (err) {
            console.error('useLiveKit: Failed to connect:', err);
            setConnectionState('disconnected');
            activeRoomRef.current = null;
        }
    }, [roomCode, username, disconnect]);

    const toggleMic = useCallback(async () => {
        const activeRoom = activeRoomRef.current;
        if (!activeRoom || !activeRoom.localParticipant) return;
        try {
            const nextState = !isMicEnabled;
            await activeRoom.localParticipant.setMicrophoneEnabled(nextState);
            setIsMicEnabled(nextState);
        } catch (err) {
            console.error('useLiveKit: Failed to toggle mic:', err);
        }
    }, [isMicEnabled]);

    const toggleCamera = useCallback(async () => {
        const activeRoom = activeRoomRef.current;
        if (!activeRoom || !activeRoom.localParticipant) return;
        try {
            const nextState = !isCamEnabled;
            await activeRoom.localParticipant.setCameraEnabled(nextState);
            setIsCamEnabled(nextState);
        } catch (err) {
            console.error('useLiveKit: Failed to toggle camera:', err);
        }
    }, [isCamEnabled]);

    const toggleScreenShare = useCallback(async () => {
        const activeRoom = activeRoomRef.current;
        if (!activeRoom || !activeRoom.localParticipant) return;
        try {
            const nextState = !isScreenSharing;
            await activeRoom.localParticipant.setScreenShareEnabled(nextState, { audio: true });
            setIsScreenSharing(nextState);
        } catch (err) {
            console.error('useLiveKit: Failed to toggle screen share:', err);
        }
    }, [isScreenSharing]);

    // Handle cleanup on unmount or changes
    useEffect(() => {
        return () => {
            if (activeRoomRef.current) {
                console.log('useLiveKit: Hook unmounting, disconnecting...');
                activeRoomRef.current.disconnect();
                activeRoomRef.current = null;
            }
        };
    }, []);

    return {
        room,
        participants,
        localParticipant,
        connectionState,
        isMicEnabled,
        isCamEnabled,
        isScreenSharing,
        connect,
        disconnect,
        toggleMic,
        toggleCamera,
        toggleScreenShare
    };
};
