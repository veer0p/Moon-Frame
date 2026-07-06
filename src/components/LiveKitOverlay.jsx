import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Mic, MicOff, Trash2, Eye, PictureInPicture2 } from 'lucide-react';
import PictureInPicture from './PictureInPicture';
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
export function TrackAudio({ track, volume = 1.0 }) {
    const audioRef = useRef(null);

    useEffect(() => {
        const el = audioRef.current;
        if (!track || !el) return;

        track.attach(el);
        return () => {
            track.detach(el);
        };
    }, [track]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    return <audio ref={audioRef} autoPlay style={{ display: 'none' }} />;
}

// Draggable Bubble component
function DraggableBubble({ p, userColor, hasCamera, getInitials, isLocal, layout, voiceVolume, onHide, onPip }) {
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 0, y: 0 });

    const handlePointerDown = (e) => {
        if (layout === 'grid') return;
        
        // Prevent drag if clicking inside buttons or on the resize handle (bottom right corner)
        const rect = e.target.getBoundingClientRect();
        const isResizeHandle = (e.clientX >= rect.right - 25) && (e.clientY >= rect.bottom - 25);
        
        if (e.target.tagName.toLowerCase() === 'button' || e.target.closest('.livekit-btn') || isResizeHandle) {
            return;
        }
        
        setIsDragging(true);
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        initialPos.current = { ...position };
        e.target.setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e) => {
        if (layout === 'grid') return;
        if (!isDragging) return;
        const dx = e.clientX - dragStartPos.current.x;
        const dy = e.clientY - dragStartPos.current.y;
        setPosition({
            x: initialPos.current.x + dx,
            y: initialPos.current.y + dy
        });
    };

    const handlePointerUp = (e) => {
        if (layout === 'grid') return;
        setIsDragging(false);
        e.target.releasePointerCapture(e.pointerId);
        
        // Hide if dropped in the bottom 20% of the screen
        if (e.clientY > window.innerHeight * 0.8) {
            if (onHide) onHide();
        }
    };

    const wrapperStyle = layout === 'grid' ? {
        cursor: 'default',
        zIndex: 1
    } : {
        transform: `translate(${position.x}px, ${position.y}px)`,
        cursor: isDragging ? 'grabbing' : 'grab',
        zIndex: isDragging ? 100 : 1,
        touchAction: 'none'
    };

    return (
        <div 
            ref={dragRef}
            className={`livekit-bubble-wrapper ${isDragging ? 'dragging' : ''} ${layout === 'grid' ? 'grid-bubble' : ''}`}
            style={wrapperStyle}
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
                    {p.participant.isMicrophoneEnabled ? <Mic size={12} strokeWidth={2.5} /> : <MicOff size={12} strokeWidth={2.5} />}
                </div>

                {/* PiP button - only for remote participants with camera */}
                {!isLocal && onPip && (
                    <button
                        className="livekit-pip-btn"
                        onClick={(e) => { e.stopPropagation(); onPip(p); }}
                        title="Picture in Picture"
                    >
                        <PictureInPicture2 size={14} />
                    </button>
                )}
            </div>
            <span className="livekit-bubble-name">
                {p.identity} {isLocal && '(You)'}
            </span>

            {/* Render audio for remote participant */}
            {!isLocal && p.audioTrack && (
                <TrackAudio track={p.audioTrack} volume={voiceVolume} />
            )}
            
            {/* Drop zone overlay rendered globally when dragging */}
            {isDragging && createPortal(
                <div className="livekit-drop-zone glass">
                    <Trash2 size={32} color="#ff4444" />
                    <span>Drop here to hide camera</span>
                </div>,
                document.body
            )}
        </div>
    );
}

export default function LiveKitOverlay({ livekit, playerContainerRef, isInactive, layout = 'floating', voiceVolume = 1.0 }) {
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
    const [hiddenBubbles, setHiddenBubbles] = useState(new Set());
    const [pipParticipant, setPipParticipant] = useState(null);

    const hideBubble = useCallback((identity) => {
        setHiddenBubbles(prev => new Set([...prev, identity]));
    }, []);

    const restoreBubble = useCallback((identity) => {
        setHiddenBubbles(prev => {
            const next = new Set(prev);
            next.delete(identity);
            return next;
        });
    }, []);

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

    const participantCount = allParticipants.length;
    const countClass = participantCount > 6 ? 'participant-count-more' : `participant-count-${participantCount}`;

    if (connectionState === 'disconnected') return null;

    return (
        <div
            ref={overlayRef}
            className={`livekit-floating-overlay ${layout === 'grid' ? 'meet-grid-layout' : ''}`}
        >

            {/* Content Panel */}
            <div className={`livekit-overlay-content ${layout === 'grid' ? 'grid-content' : ''}`}>
                <div className={`livekit-bubbles-container ${layout === 'grid' ? `grid-bubbles ${countClass}` : ''}`}>
                    {allParticipants.filter(p => !hiddenBubbles.has(p.identity)).map((p) => {
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
                                layout={layout}
                                voiceVolume={voiceVolume}
                                onHide={() => hideBubble(p.identity)}
                                onPip={!p.isLocal ? (participant) => setPipParticipant(participant) : undefined}
                            />
                        );
                    })}
                </div>
                
                {/* Hidden participants restore buttons */}
                {hiddenBubbles.size > 0 && (
                    <div className="livekit-hidden-container">
                        {allParticipants.filter(p => hiddenBubbles.has(p.identity)).map(p => (
                            <button key={p.identity} className="livekit-restore-btn" onClick={() => restoreBubble(p.identity)} title={`Show ${p.identity}`}>
                                <Eye size={16} />
                                <span className="livekit-bubble-name" style={{ position: 'static' }}>{p.identity}</span>
                                {!p.isLocal && p.audioTrack && <TrackAudio track={p.audioTrack} volume={voiceVolume} />}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Picture-in-Picture floating window */}
            {pipParticipant && (
                <PictureInPicture
                    participant={pipParticipant}
                    onClose={() => setPipParticipant(null)}
                    voiceVolume={voiceVolume}
                />
            )}
        </div>
    );
}
