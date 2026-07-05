import { useEffect, useRef, useCallback } from 'react';
import { logSyncEvent } from '../utils/syncLogger';

export const useVideoSync = (videoRef, roomState, updateRoom, username, userCount = 1, videoFile = null) => {
    const isApplyingRemote = useRef(false);
    const lastAppliedTimestamp = useRef(null);
    const heartbeatRef = useRef(null);

    // Apply remote state changes
    useEffect(() => {
        if (!roomState || !videoRef.current || !username || !videoFile) return;

        // Ignore own actions
        if (roomState.last_action_by === username) return;

        // Dedup: skip if we already applied this exact update
        const updateId = roomState.updated_at;
        if (updateId && updateId === lastAppliedTimestamp.current) return;
        lastAppliedTimestamp.current = updateId;

        const video = videoRef.current;
        isApplyingRemote.current = true;

        console.log('useVideoSync: Applying remote state', {
            is_playing: roomState.is_playing,
            video_time: roomState.video_time,
            last_action_by: roomState.last_action_by
        });

        // --- SEEK ---
        const targetTime = roomState.video_time;
        if (targetTime !== undefined && targetTime !== null) {
            const drift = Math.abs(video.currentTime - targetTime);
            if (drift > 1.0) {
                console.log('useVideoSync: Seeking', { from: video.currentTime, to: targetTime });
                video.currentTime = targetTime;
            }
        }

        // --- PLAY / PAUSE ---
        if (roomState.is_playing !== undefined) {
            if (roomState.is_playing && video.paused) {
                console.log('useVideoSync: Playing');
                video.play().catch(err => console.error('Play error:', err));
            } else if (!roomState.is_playing && !video.paused) {
                console.log('useVideoSync: Pausing');
                video.pause();
            }
        }

        // --- PLAYBACK RATE ---
        if (roomState.playback_rate && video.playbackRate !== roomState.playback_rate) {
            video.playbackRate = roomState.playback_rate;
        }

        setTimeout(() => {
            isApplyingRemote.current = false;
        }, 500);
    }, [roomState, videoRef, username, userCount]);

    // --- HEARTBEAT: Periodically broadcast current time while playing ---
    // This ensures late-joiners and reconnecting clients get synced
    useEffect(() => {
        if (!updateRoom || !videoRef.current || !videoFile || !username) {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
            return;
        }

        heartbeatRef.current = setInterval(() => {
            const video = videoRef.current;
            if (!video || video.paused || isApplyingRemote.current) return;

            // Only broadcast if actually playing and time is moving
            if (video.currentTime > 0) {
                console.debug('useVideoSync: Heartbeat', { time: video.currentTime.toFixed(1) });
                updateRoom({
                    is_playing: true,
                    video_time: video.currentTime
                });
            }
        }, 5000); // Every 5 seconds

        return () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
        };
    }, [updateRoom, videoRef, videoFile, username]);

    // --- Outbound sync functions ---
    const syncPlay = useCallback(() => {
        if (isApplyingRemote.current || !videoRef.current) return;
        updateRoom({ is_playing: true, video_time: videoRef.current.currentTime });
    }, [updateRoom, videoRef]);

    const syncPause = useCallback(() => {
        if (isApplyingRemote.current || !videoRef.current) return;
        updateRoom({ is_playing: false, video_time: videoRef.current.currentTime });
    }, [updateRoom, videoRef]);

    const syncSeek = useCallback((time) => {
        if (isApplyingRemote.current) return;
        updateRoom({ video_time: time });
    }, [updateRoom]);

    const syncPlaybackRate = useCallback((rate) => {
        if (isApplyingRemote.current) return;
        updateRoom({ playback_rate: rate });
    }, [updateRoom]);

    return { syncPlay, syncPause, syncSeek, syncPlaybackRate };
};
