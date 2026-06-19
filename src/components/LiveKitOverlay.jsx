import { useState, useEffect, useRef, useCallback } from 'react';
import './LiveKitOverlay.css';

// Helper to render video tracks (camera or screen share) using HTML5 video tag
export function TrackVideo({ track, isLocal = false }) {
    const videoRef = useRef(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!track || !el) return;

        track.attach(el);
        return () => {
            track.detach(el);
        };
    }, [track]);

    return (
        <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocal} // local video must be muted to prevent loopback
            className="livekit-video-stream"
        />
    );
}

// Helper to render remote audio tracks in the background
export function TrackAudio({ track }) {
    const audioRef = useRef(null);

    useEffect(() => {
        const el = audioRef.current;
        if (!track || !el) return;

        track.attach(el);
        return () => {
            track.detach(el);
        };
    }, [track]);

    return <audio ref={audioRef} autoPlay style={{ display: 'none' }} />;
    return <audio ref={audioRef} autoPlay style={{ display: 'none' }} />;
}

// Draggable Bubble component
function DraggableBubble({ p, userColor, hasCamera, getInitials, isLocal }) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e) => {
        // Prevent drag if clicking inside buttons
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('.livekit-btn')) {
            return;
        }
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialPos.current = { ...position };
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        setPosition({
            x: initialPos.current.x + dx,
            y: initialPos.current.y + dy
        });
    };

    const handlePointerUp = (e) => {
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
    };

    return (
        <div 
            ref={dragRef}
            className={`livekit-bubble-wrapper ${isDragging ? 'dragging' : ''}`}
            style={{ 
                transform: `translate(${position.x}px, ${position.y}px)`,
                cursor: isDragging ? 'grabbing' : 'grab',
                zIndex: isDragging ? 100 : 1
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
        >
            <div
                className="livekit-webcam-bubble"
                style={{
                    borderColor: userColor,
                    boxShadow: `0 0 10px ${userColor}40`
                }}
            >
                {hasCamera ? (
                    <TrackVideo track={p.videoTrack} isLocal={isLocal} />
                ) : (
                    <div
                        className="livekit-avatar-placeholder"
                        style={{ backgroundColor: userColor }}
                    >
                        {getInitials(p.identity)}
                    </div>
                )}

                {/* Mic status indicator */}
                <div className={`livekit-bubble-mic-status ${p.participant.isMicrophoneEnabled ? 'on' : 'off'}`}>
                    {p.participant.isMicrophoneEnabled ? (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zM17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                    ) : (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17l1.42 1.42C16.82 11.96 17 11.5 17 11c0-2.76-2.24-5-5-5-1.01 0-1.94.3-2.73.81l1.42 1.42C11.1 9.07 11.54 9 12 9c1.66 0 3 1.34 3 3 0 .43-.07.83-.17 1.17zM3.27 3L2 4.27l6.03 6.03v.7c0 2.76 2.24 5 5 5 .94 0 1.83-.26 2.58-.73l2.87 2.87 1.27-1.27L3.27 3zM12 18c-3.11 0-5.69-2.31-5.96-5.32l4.88 4.88c-.29.28-.6.37-.92.44v3h2v-3.08c.34-.05.67-.14.98-.28L12 18zm1.03-7.85l-3-3c-.1-.13-.17-.28-.17-.46C9.86 5.76 10.82 5 12 5c1.66 0 3 1.34 3 3v.77c0 .18-.08.33-.17.46l-1.8 1.8z" />
                        </svg>
                    )}
                </div>
            </div>
            <span className="livekit-bubble-name">
                {p.identity} {isLocal && '(You)'}
            </span>

            {/* Render audio for remote participant */}
            {!isLocal && p.audioTrack && (
                <TrackAudio track={p.audioTrack} />
            )}
        </div>
    );
}

export default function LiveKitOverlay({ livekit, playerContainerRef, isInactive }) {
    const {
        participants,
        localParticipant,
        isMicEnabled,
        isCamEnabled,
        isScreenSharing,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        disconnect,
        connectionState
    } = livekit;

    const overlayRef = useRef(null);

    // Get initials of username
    const getInitials = (name) => {
        if (!name) return '?';
        return name.slice(0, 2).toUpperCase();
    };

    // Generate deterministic colors for avatars
    const getUserColor = (name) => {
        if (!name) return '#a855f7';
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const colors = [
            '#ef4444', '#f97316', '#f59e0b', '#10b981',
            '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899'
        ];
        return colors[Math.abs(hash) % colors.length];
    };

    // Extract tracks from participants
    const getTracks = (participant) => {
        if (!participant) return { videoTrack: null, audioTrack: null, screenShareTrack: null };

        const videoTrack = Array.from(participant.videoTrackPublications.values())
            .find(pub => pub.source === 'camera')?.track;

        const audioTrack = Array.from(participant.audioTrackPublications.values())
            .find(pub => pub.source === 'microphone')?.track;

        const screenShareTrack = Array.from(participant.videoTrackPublications.values())
            .find(pub => pub.source === 'screen_share')?.track;

        return { videoTrack, audioTrack, screenShareTrack };
    };

    // Dragging logic removed for fixed grid layout

    // Gather all participants including local
    const allParticipants = [];
    if (localParticipant) {
        allParticipants.push({
            identity: localParticipant.identity,
            isLocal: true,
            participant: localParticipant,
            ...getTracks(localParticipant)
        });
    }

    participants.forEach(p => {
        allParticipants.push({
            identity: p.identity,
            isLocal: false,
            participant: p,
            ...getTracks(p)
        });
    });

    // Check if anyone is screen sharing
    const screenShareUser = allParticipants.find(p => p.screenShareTrack);

    if (connectionState === 'disconnected') return null;

    return (
        <div
            ref={overlayRef}
            className="livekit-floating-overlay"
        >

            {/* Content Panel */}
            <div className="livekit-overlay-content">
                {/* Regular Webcams Row/Grid */}
                <div className="livekit-bubbles-container">
                    {allParticipants.map((p) => {
                        const hasCamera = p.videoTrack && p.participant.isCameraEnabled;
                        const userColor = getUserColor(p.identity);
                        return (
                            <DraggableBubble 
                                key={p.identity}
                                p={p}
                                userColor={userColor}
                                hasCamera={hasCamera}
                                getInitials={getInitials}
                                isLocal={p.isLocal}
                            />
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
