import { useEffect, useRef } from 'react';

export const useVideoSync = (videoRef, roomState, updateRoom, username, userCount = 1) => {
    const isApplyingRemote = useRef(false);
    const lastSyncedState = useRef(null);

    // Apply remote state changes
    useEffect(() => {
        if (!roomState || !videoRef.current || !username) {
            console.debug('useVideoSync: Waiting for dependencies...', { roomState: !!roomState, video: !!videoRef.current, username });
            return;
        }

        // Ignore if we made this change
        if (roomState.last_action_by === username) {
            console.log('useVideoSync: Ignoring own action');
            return;
        }

        const video = videoRef.current;
        isApplyingRemote.current = true;

        console.log('useVideoSync: Applying remote state', {
            is_playing: roomState.is_playing,
            video_time: roomState.video_time,
            playback_rate: roomState.playback_rate,
            last_action_by: roomState.last_action_by,
            userCount
        });

        // Sync time if significantly different (more than 1.0 second)
        const timeDiff = Math.abs(video.currentTime - roomState.video_time);
        if (timeDiff > 1.0) {
            console.log('useVideoSync: Syncing time', { current: video.currentTime, target: roomState.video_time });
            video.currentTime = roomState.video_time;
        }

        // Sync playback state
        if (roomState.is_playing && video.paused) {
            console.log('useVideoSync: Playing video');
            video.play().catch(err => console.error('Play error:', err));
        } else if (!roomState.is_playing && !video.paused) {
            console.log('useVideoSync: Pausing video');
            video.pause();
        }

        // Sync playback rate
        if (video.playbackRate !== roomState.playback_rate) {
            console.log('useVideoSync: Changing playback rate', { from: video.playbackRate, to: roomState.playback_rate });
            video.playbackRate = roomState.playback_rate;
        }

        // NOTE: Volume sync removed - each user controls their own volume

        lastSyncedState.current = roomState;

        setTimeout(() => {
            isApplyingRemote.current = false;
        }, 200);
    }, [roomState, videoRef, username, userCount]);

    // Sync local actions to room
    const syncPlay = () => {
        if (isApplyingRemote.current || !videoRef.current) {
            console.log('syncPlay: Skipped (applying remote or no video)');
            return;
        }

        // Prevent play if alone in room
        if (userCount === 1) {
            console.log('syncPlay: Prevented - alone in room');
            return;
        }

        console.log('syncPlay: Syncing play action', { time: videoRef.current.currentTime });
        updateRoom({
            is_playing: true,
            video_time: videoRef.current.currentTime
        });
    };

    const syncPause = () => {
        if (isApplyingRemote.current || !videoRef.current) {
            console.log('syncPause: Skipped (applying remote or no video)');
            return;
        }
        console.log('syncPause: Syncing pause action', { time: videoRef.current.currentTime });
        updateRoom({
            is_playing: false,
            video_time: videoRef.current.currentTime
        });
    };

    const syncSeek = (time) => {
        if (isApplyingRemote.current) {
            console.log('syncSeek: Skipped (applying remote)');
            return;
        }
        console.log('syncSeek: Syncing seek action', { time });
        updateRoom({
            video_time: time
        });
    };

    const syncPlaybackRate = (rate) => {
        if (isApplyingRemote.current) {
            console.log('syncPlaybackRate: Skipped (applying remote)');
            return;
        }
        console.log('syncPlaybackRate: Syncing rate change', { rate });
        updateRoom({
            playback_rate: rate
        });
    };

    return { syncPlay, syncPause, syncSeek, syncPlaybackRate };
};
