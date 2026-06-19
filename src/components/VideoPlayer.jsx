import { useState, useRef, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import SyncIndicator from './SyncIndicator';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useInactivityTimer from '../hooks/useInactivityTimer';
import { useVideoSync } from '../hooks/useVideoSync';
import { useLiveKit } from '../hooks/useLiveKit';
import LiveKitOverlay, { TrackVideo } from './LiveKitOverlay';
import formatTime from '../utils/formatTime';
import './VideoPlayer.css';

function VideoPlayer({
    videoFile,
    onVideoFileSelect,
    roomState,
    updateRoom,
    username,
    userCount = 1,
    messages = [],
    onSendMessage,
    onEmojiReaction,
    onFullscreenChange,
    roomCode,
    isConnected,
    showSidebar,
    onToggleChat,
    onLeave
}) {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [buffered, setBuffered] = useState(0);
    const [hasError, setHasError] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [audioTracks, setAudioTracks] = useState([]);
    const [selectedAudioTrack, setSelectedAudioTrack] = useState(0);
    const [textTracks, setTextTracks] = useState([]);
    const [selectedSubtitle, setSelectedSubtitle] = useState(-1); // -1 means off
    const [showChat, setShowChat] = useState(false);
    const [feedback, setFeedback] = useState(null); // { type, value, icon }
    const [isLoading, setIsLoading] = useState(false);
    const [showMobileVolume, setShowMobileVolume] = useState(false); // Mobile volume overlay
    const [timeOffset, setTimeOffset] = useState(0); // Time offset for remuxed files (MKV etc.)
    const [preferScreenShare, setPreferScreenShare] = useState(true);

    const containerRef = useRef(null);
    const feedbackTimeoutRef = useRef(null); // Track feedback timeout for debouncing
    const cumulativeSeekRef = useRef(0); // Track cumulative seek amount
    const seekResetTimeoutRef = useRef(null); // Reset cumulative seek after inactivity
    const { isInactive } = useInactivityTimer(containerRef, 3000);
    const livekit = useLiveKit(roomCode, username);
    const {
        isMicEnabled,
        isCamEnabled,
        isScreenSharing,
        toggleMic,
        toggleCamera,
        toggleScreenShare,
        disconnect,
        connectionState,
        connect,
        error: livekitError
    } = livekit;

    // Auto-connect to LiveKit on mount
    useEffect(() => {
        if (connectionState === 'disconnected' && !livekitError && roomCode) {
            connect();
        }
    }, [connectionState, connect, livekitError, roomCode]);

    // Determine active screen share
    const allLivekitParticipants = [];
    if (livekit.localParticipant) allLivekitParticipants.push(livekit.localParticipant);
    if (livekit.participants) allLivekitParticipants.push(...livekit.participants);
    
    const activeScreenShareParticipant = allLivekitParticipants.find(p => {
        return Array.from(p.videoTrackPublications.values()).some(pub => pub.source === 'screen_share');
    });
    
    const screenShareTrack = activeScreenShareParticipant 
        ? Array.from(activeScreenShareParticipant.videoTrackPublications.values()).find(pub => pub.source === 'screen_share')?.track 
        : null;

    const handleCopyRoomCode = () => {
        if (!roomCode) return;
        navigator.clipboard.writeText(roomCode);
        triggerFeedback('copy', 'Room Code Copied!', (
            <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
            </svg>
        ));
    };

    const handleToggleChat = () => {
        if (isFullscreen) {
            setShowChat(prev => !prev);
        } else {
            if (onToggleChat) onToggleChat();
        }
    };
    const { syncPlay, syncPause, syncSeek, syncPlaybackRate } = useVideoSync(
        videoRef,
        roomState,
        updateRoom,
        username,
        userCount
    );

    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
            if (onFullscreenChange) {
                onFullscreenChange(isCurrentlyFullscreen);
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

        let unsubscribeElectron = null;
        if (window.electronAPI && window.electronAPI.onFullscreenChange) {
            unsubscribeElectron = window.electronAPI.onFullscreenChange((isCurrentlyFullscreen) => {
                setIsFullscreen(isCurrentlyFullscreen);
                if (onFullscreenChange) {
                    onFullscreenChange(isCurrentlyFullscreen);
                }
            });
        }

        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            if (unsubscribeElectron) {
                unsubscribeElectron();
            }
        };
    }, [onFullscreenChange]);

    useEffect(() => {
        if (videoFile && videoRef.current) {
            console.log('Loading video file:', videoFile.name);
            setHasError(false);
            setErrorMessage('');
            setTimeOffset(0);

            let url;
            if (videoFile.previewUrl) {
                // Electron custom protocol
                url = videoFile.previewUrl;
                console.log('Using custom protocol URL:', url);
                videoRef.current.src = url;
            } else {
                // Web File object
                url = URL.createObjectURL(videoFile);
                console.log('Created blob URL:', url);
                videoRef.current.src = url;
            }

            videoRef.current.load(); // Explicitly load the video
            return () => {
                if (!videoFile.previewUrl) {
                    console.log('Cleaning up blob URL');
                    URL.revokeObjectURL(url);
                }
            };
        } else {
            console.log('No video file or video ref:', { videoFile, hasRef: !!videoRef.current });
        }
    }, [videoFile]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleTimeUpdate = () => setCurrentTime(video.currentTime);
        const handleDurationChange = () => setDuration(video.duration);
        const handleProgress = () => {
            if (video.buffered.length > 0) {
                setBuffered(video.buffered.end(video.buffered.length - 1));
            }
        };
        const handleLoadedData = () => {
            console.log('Video loaded and ready to play');

            // Detect audio tracks
            if (video.audioTracks && video.audioTracks.length > 0) {
                const tracks = Array.from(video.audioTracks).map((track, index) => ({
                    index,
                    label: track.label || `Audio ${index + 1}`,
                    language: track.language || 'unknown',
                    enabled: track.enabled
                }));
                setAudioTracks(tracks);
                console.log('Audio tracks detected:', tracks);
            }

            // Detect text tracks (subtitles)
            if (video.textTracks && video.textTracks.length > 0) {
                const tracks = Array.from(video.textTracks).map((track, index) => ({
                    index,
                    label: track.label || `Subtitle ${index + 1}`,
                    language: track.language || 'unknown',
                    kind: track.kind
                }));
                setTextTracks(tracks);
                console.log('Text tracks detected:', tracks);
            }
        };
        const handleError = (e) => {
            console.error('Video error:', e);
            const video = videoRef.current;
            if (video && video.error) {
                console.error('Video error code:', video.error.code, 'message:', video.error.message);

                const errorMsg = video.error.message || '';

                if (video.error.code === 4) {
                    // Check if it's a codec issue vs format issue
                    if (errorMsg.includes('no supported streams') || errorMsg.includes('DEMUXER_ERROR')) {
                        if (videoFile?.needsRemux) {
                            setErrorMessage('This video has codecs that cannot be remuxed to MP4. The video codec may not be H.264/H.265 compatible. Try re-encoding the file with: ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4');
                        } else if (videoFile?.type === 'video/mp4') {
                            setErrorMessage('MP4 file has unsupported codecs (likely HEVC/H.265). Please re-encode with H.264 video and AAC audio.');
                        } else {
                            setErrorMessage('Video format not supported. Please use MP4 with H.264 video and AAC audio.');
                        }
                    } else {
                        setErrorMessage('Video format not supported. In the desktop app, MKV/AVI/FLV files are automatically remuxed. In browser, please use MP4, WebM, or OGG.');
                    }
                } else {
                    setErrorMessage('Error loading video. Please try a different file.');
                }
                setHasError(true);
            }
        };

        const handleWaiting = () => setIsLoading(true);
        const handlePlaying = () => setIsLoading(false);

        // NEW: Sync isPlaying state with actual video state
        const handlePlay = () => {
            console.log('Video play event fired');
            setIsPlaying(true);
        };
        const handlePause = () => {
            console.log('Video pause event fired');
            setIsPlaying(false);
        };

        video.addEventListener('timeupdate', handleTimeUpdate);
        video.addEventListener('durationchange', handleDurationChange);
        video.addEventListener('progress', handleProgress);
        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('error', handleError);
        video.addEventListener('waiting', handleWaiting);
        video.addEventListener('playing', handlePlaying);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('timeupdate', handleTimeUpdate);
            video.removeEventListener('durationchange', handleDurationChange);
            video.removeEventListener('progress', handleProgress);
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('error', handleError);
            video.removeEventListener('waiting', handleWaiting);
            video.removeEventListener('playing', handlePlaying);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, []);

    const triggerFeedback = (type, value, icon) => {
        // Clear any existing timeout to extend visibility on repeated actions
        if (feedbackTimeoutRef.current) {
            clearTimeout(feedbackTimeoutRef.current);
        }

        setFeedback({ type, value, icon });

        // Set new timeout and store reference
        feedbackTimeoutRef.current = setTimeout(() => {
            setFeedback(null);
            feedbackTimeoutRef.current = null;
        }, 600); // Fast response, but extends on each interaction
    };

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video || !videoFile) return;

        if (video.readyState < 2) {
            console.log('Video not ready yet, readyState:', video.readyState);
            return;
        }

        if (video.paused) {
            video.play().catch((error) => {
                console.error('Play error:', error);
            });
            // isPlaying state will be updated by 'play' event listener
            triggerFeedback('play', null, (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            ));
            if (updateRoom) syncPlay();
        } else {
            video.pause();
            // isPlaying state will be updated by 'pause' event listener
            triggerFeedback('pause', null, (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
            ));
            if (updateRoom) syncPause();
        }
    };

    const handleSeek = (time, amount) => {
        const video = videoRef.current;
        if (!video) return;

        // For remuxed files, seeking requires changing the src URL
        // FFmpeg restarts at the new position via ?t= parameter
        if (videoFile?.needsRemux && videoFile?.filePath) {
            const seekTarget = amount ? (timeOffset + currentTime + amount) : time;
            const clampedTarget = Math.max(0, Math.min(seekTarget, (videoFile.mediaDuration || duration)));
            setTimeOffset(clampedTarget);
            setCurrentTime(0);
            setIsLoading(true);
            const newUrl = `video://${videoFile.filePath}?t=${clampedTarget}`;
            video.src = newUrl;
            video.load();
            if (isPlaying) {
                video.play().catch(err => console.error('Play after seek error:', err));
            }
            if (updateRoom) syncSeek(clampedTarget);
            return;
        }

        video.currentTime = time;
        setCurrentTime(time);
        if (amount) {
            // Clear the reset timeout since user is still seeking
            if (seekResetTimeoutRef.current) {
                clearTimeout(seekResetTimeoutRef.current);
            }

            // Accumulate the seek amount
            cumulativeSeekRef.current += amount;
            const totalSeek = Math.abs(cumulativeSeekRef.current);
            const isForward = cumulativeSeekRef.current > 0;
            const icon = isForward ? (
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
                </svg>
            ) : (
                <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z" />
                </svg>
            );
            // Show cumulative total
            triggerFeedback('seek', `${totalSeek}s`, icon);

            // Reset cumulative seek after 1 second of no seeking
            seekResetTimeoutRef.current = setTimeout(() => {
                cumulativeSeekRef.current = 0;
                seekResetTimeoutRef.current = null;
            }, 1000);
        }

        if (updateRoom) syncSeek(time);
    };

    const handleVolumeChange = (newVolume) => {
        const video = videoRef.current;
        if (!video) return;
        video.volume = newVolume;
        setVolume(newVolume);
        if (newVolume > 0) setIsMuted(false);
        triggerFeedback('volume', Math.round(newVolume * 100) + '%', null);
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setIsMuted(!video.muted);
    };

    const toggleMobileVolume = () => {
        setShowMobileVolume(prev => !prev);
        // Auto-hide after 3 seconds
        if (!showMobileVolume) {
            setTimeout(() => setShowMobileVolume(false), 3000);
        }
    };

    const changePlaybackRate = (rate) => {
        const video = videoRef.current;
        if (!video) return;
        video.playbackRate = rate;
        setPlaybackRate(rate);
        triggerFeedback('speed', rate + 'x', null);
        if (updateRoom) syncPlaybackRate(rate);
    };

    const toggleFullscreen = () => {
        if (window.electronAPI && window.electronAPI.toggleFullscreen) {
            window.electronAPI.toggleFullscreen().catch(err => {
                console.error('Error toggling Electron fullscreen:', err);
            });
        } else {
            if (!document.fullscreenElement) {
                containerRef.current?.requestFullscreen().catch(err => {
                    console.error('Error entering browser fullscreen:', err);
                });
            } else {
                document.exitFullscreen().catch(err => {
                    console.error('Error exiting browser fullscreen:', err);
                });
            }
        }
    };

    const handleStop = () => {
        const video = videoRef.current;
        if (!video) return;
        video.pause();
        video.currentTime = 0;
        // isPlaying state will be updated by 'pause' event listener
        if (updateRoom) syncPause();
    };

    const handleCycleAudioTrack = () => {
        if (audioTracks.length <= 1) return;
        const nextTrack = (selectedAudioTrack + 1) % audioTracks.length;
        handleAudioTrackChange(nextTrack);
    };

    const handleCycleSubtitles = () => {
        if (textTracks.length === 0) return;
        const nextTrack = selectedSubtitle + 1 >= textTracks.length ? -1 : selectedSubtitle + 1;
        handleSubtitleChange(nextTrack);
    };

    const handleAudioTrackChange = (trackIndex) => {
        const video = videoRef.current;
        if (!video || !video.audioTracks) return;

        // Disable all audio tracks
        for (let i = 0; i < video.audioTracks.length; i++) {
            video.audioTracks[i].enabled = false;
        }

        // Enable selected track
        if (trackIndex >= 0 && trackIndex < video.audioTracks.length) {
            video.audioTracks[trackIndex].enabled = true;
            setSelectedAudioTrack(trackIndex);
            console.log('Switched to audio track:', trackIndex);
        }
    };

    const handleSubtitleChange = (trackIndex) => {
        const video = videoRef.current;
        if (!video || !video.textTracks) return;

        // Disable all text tracks
        for (let i = 0; i < video.textTracks.length; i++) {
            video.textTracks[i].mode = 'hidden';
        }

        // Enable selected track or turn off
        if (trackIndex >= 0 && trackIndex < video.textTracks.length) {
            video.textTracks[trackIndex].mode = 'showing';
            setSelectedSubtitle(trackIndex);
            console.log('Enabled subtitle track:', trackIndex);
        } else {
            setSelectedSubtitle(-1);
            console.log('Subtitles disabled');
        }
    };

    useKeyboardShortcuts({
        onPlayPause: togglePlay,
        onStop: handleStop,
        onSeekForward: (amount = 10) => {
            const effectiveTime = videoFile?.needsRemux ? timeOffset + currentTime : currentTime;
            const effectiveDuration = videoFile?.mediaDuration || duration;
            handleSeek(Math.min(effectiveTime + amount, effectiveDuration), amount);
        },
        onSeekBackward: (amount = 10) => {
            const effectiveTime = videoFile?.needsRemux ? timeOffset + currentTime : currentTime;
            handleSeek(Math.max(effectiveTime - amount, 0), -amount);
        },
        onVolumeUp: () => handleVolumeChange(Math.min(volume + 0.1, 1)),
        onVolumeDown: () => handleVolumeChange(Math.max(volume - 0.1, 0)),
        onMute: toggleMute,
        onFullscreen: toggleFullscreen,
        onCycleSubtitles: handleCycleSubtitles,
        onCycleAudio: handleCycleAudioTrack,
        onSlowDown: () => changePlaybackRate(Math.max(playbackRate - 0.25, 0.25)),
        onSpeedUp: () => changePlaybackRate(Math.min(playbackRate + 0.25, 4)),
        onResetSpeed: () => changePlaybackRate(1),
        onToggleChat: handleToggleChat,
    });

    return (
        <div ref={containerRef} className="video-player">
            {videoFile && (
                <div className={`video-controls-top glass ${isInactive ? 'hidden' : ''}`}>
                    <div className="controls-top-left">
                        <div className="room-code-badge" onClick={handleCopyRoomCode} title="Click to copy Room Code">
                            <span className="room-code-label">Room:</span>
                            <span className="room-code-val">{roomCode}</span>
                            <svg className="copy-icon" viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>
                            </svg>
                        </div>
                        <SyncIndicator status={isConnected ? (isLoading ? 'syncing' : 'synced') : 'disconnected'} />
                    </div>
                    <div className="controls-top-right">
                        <button
                            className={`control-btn chat-toggle-btn ${((isFullscreen ? showChat : showSidebar)) ? 'active' : ''}`}
                            onClick={handleToggleChat}
                            aria-label="Toggle chat"
                            title="Toggle Chat"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                            </svg>
                        </button>
                        <button
                            className="control-btn leave-btn-player"
                            onClick={onLeave}
                            aria-label="Leave room"
                            title="Leave Room"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                <polyline points="16 17 21 12 16 7" />
                                <line x1="21" y1="12" x2="9" y2="12" />
                            </svg>
                            <span>Leave</span>
                        </button>
                    </div>
                </div>
            )}

            {!videoFile && !hasError && (
                <div className="video-placeholder">
                    {onVideoFileSelect && (
                        <label className="screenshare-toggle-btn glass" style={{ position: 'relative', top: '0', transform: 'none', margin: 'auto' }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginRight: '8px', verticalAlign: 'middle' }}>
                                <path d="M14.752 11.168L20.87 7.542C21.5291 7.15705 22.3589 7.14074 23.0341 7.49963C23.7092 7.85852 24.1167 8.53305 24.1 9.266V14.734C24.1167 15.467 23.7092 16.1415 23.0341 16.5004C22.3589 16.8593 21.5291 16.8429 20.87 16.458L14.752 12.832C14.1169 12.4632 13.7207 11.7923 13.7207 11.07C13.7207 10.3477 14.1169 9.67684 14.752 9.308V11.168Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M2 6C2 4.89543 2.89543 4 4 4H12C13.1046 4 14 4.89543 14 6V18C14 19.1046 13.1046 20 12 20H4C2.89543 20 2 19.1046 2 18V6Z" stroke="currentColor" strokeWidth="2" />
                            </svg>
                            Choose Local Video
                            <input 
                                type="file" 
                                accept="video/mp4,video/webm,video/ogg,.mkv,.avi,.flv" 
                                onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                        onVideoFileSelect(e.target.files[0]);
                                    }
                                }} 
                                style={{ display: 'none' }} 
                            />
                        </label>
                    )}
                </div>
            )}

            {hasError && (
                <div className="video-error">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                        <path d="M12 8V12M12 16H12.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                    <p>Unsupported Video Format</p>
                    <span>{errorMessage}</span>
                    <div className="supported-formats">
                        <strong>Supported formats:</strong> MP4, WebM, OGG. In desktop: MKV, AVI, FLV, TS (auto-remuxed).
                    </div>
                </div>
            )}

            {isLoading && (
                <div className="video-loading">
                    <div className="spinner"></div>
                </div>
            )}

            {feedback && (
                feedback.type === 'volume' ? (
                    <div className="volume-overlay">
                        <div className="volume-bar-container">
                            <div className="volume-bar-fill" style={{ height: feedback.value }}></div>
                        </div>
                        <span className="feedback-value">{feedback.value}</span>
                    </div>
                ) : (
                    <div className="feedback-overlay">
                        <div className="feedback-icon">{feedback.icon}</div>
                        {feedback.value && <span className="feedback-value">{feedback.value}</span>}
                    </div>
                )
            )}

            {screenShareTrack && preferScreenShare ? (
                <div className="main-screenshare-container">
                    <TrackVideo track={screenShareTrack} isLocal={activeScreenShareParticipant === livekit.localParticipant} />
                </div>
            ) : (
                <video
                    ref={videoRef}
                    className="video-element"
                    onClick={videoFile ? togglePlay : undefined}
                    onDoubleClick={videoFile ? toggleFullscreen : undefined}
                    style={{ display: videoFile && !hasError ? 'block' : 'none', cursor: videoFile ? 'pointer' : 'default' }}
                />
            )}

            {screenShareTrack && (
                <button 
                    className="screenshare-toggle-btn glass"
                    onClick={() => setPreferScreenShare(!preferScreenShare)}
                >
                    {preferScreenShare ? "View Video" : "View Screen Share"}
                </button>
            )}

            <LiveKitOverlay
                livekit={livekit}
                playerContainerRef={containerRef}
                isInactive={isInactive}
            />

            {isFullscreen && (
                <div className={`fullscreen-chat-overlay ${!showChat ? 'hidden' : ''}`}>
                    <ChatPanel
                        messages={messages}
                        onSendMessage={onSendMessage}
                        currentUsername={username}
                        onEmojiReaction={onEmojiReaction}
                    />
                </div>
            )}

            <div className={`video-controls glass ${isInactive || !videoFile ? 'hidden' : ''}`}>
                <div className="timeline-container">
                    {(() => {
                        const effectiveTime = videoFile?.needsRemux ? timeOffset + currentTime : currentTime;
                        const effectiveDuration = videoFile?.mediaDuration || duration;
                        return (
                            <>
                                <div
                                    className="timeline-progress"
                                    style={{ width: `${effectiveDuration > 0 ? (effectiveTime / effectiveDuration) * 100 : 0}%` }}
                                />
                                <div
                                    className="buffered-indicator"
                                    style={{ width: `${effectiveDuration > 0 ? (buffered / effectiveDuration) * 100 : 0}%` }}
                                />
                                <input
                                    type="range"
                                    className="timeline"
                                    min="0"
                                    max={effectiveDuration || 0}
                                    value={effectiveTime}
                                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                                    aria-label="Video timeline"
                                    aria-valuemin="0"
                                    aria-valuemax={effectiveDuration || 0}
                                    aria-valuenow={effectiveTime}
                                    aria-valuetext={`${formatTime(effectiveTime)} of ${formatTime(effectiveDuration)}`}
                                />
                            </>
                        );
                    })()}
                </div>

                <div className="controls-row">
                    <div className="controls-left">
                        <button
                            className="control-btn"
                            onClick={togglePlay}
                            aria-label={isPlaying ? "Pause video" : "Play video"}
                        >
                            {isPlaying ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                </svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M8 5v14l11-7z" />
                                </svg>
                            )}
                        </button>

                        <div className="volume-control">
                            <button
                                className="control-btn volume-btn"
                                onClick={toggleMute}
                                onTouchStart={(e) => {
                                    e.preventDefault();
                                    toggleMobileVolume();
                                }}
                                aria-label={isMuted ? "Unmute" : "Mute"}
                            >
                                {isMuted || volume === 0 ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                                    </svg>
                                ) : volume < 0.5 ? (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7 9v6h4l5 5V4l-5 5H7z" />
                                    </svg>
                                ) : (
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                                    </svg>
                                )}
                            </button>

                            {/* Mobile volume overlay */}
                            {showMobileVolume && (
                                <div className="mobile-volume-overlay">
                                    <div className="mobile-volume-slider-container">
                                        <input
                                            type="range"
                                            className="mobile-volume-slider"
                                            orient="vertical"
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={isMuted ? 0 : volume}
                                            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                        />
                                        <span className="mobile-volume-value">{Math.round((isMuted ? 0 : volume) * 100)}%</span>
                                    </div>
                                </div>
                            )}

                            <input
                                type="range"
                                className="volume-slider"
                                min="0"
                                max="1"
                                step="0.01"
                                value={isMuted ? 0 : volume}
                                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                                style={{ '--volume-percent': `${(isMuted ? 0 : volume) * 100}%` }}
                                aria-label="Volume"
                                aria-valuemin="0"
                                aria-valuemax="100"
                                aria-valuenow={Math.round((isMuted ? 0 : volume) * 100)}
                            />
                        </div>

                        <span className="time-display">
                            {formatTime(videoFile?.needsRemux ? timeOffset + currentTime : currentTime)} / {formatTime(videoFile?.mediaDuration || duration)}
                        </span>
                    </div>

                    <div className="controls-right">
                        <select
                            className="track-selector"
                            value={selectedAudioTrack}
                            onChange={(e) => handleAudioTrackChange(parseInt(e.target.value))}
                            title="Audio Track"
                            disabled={audioTracks.length <= 1}
                        >
                            {audioTracks.length === 0 ? (
                                <option value="0">🎵 Default</option>
                            ) : audioTracks.length === 1 ? (
                                <option value="0">🎵 {audioTracks[0].label}</option>
                            ) : (
                                audioTracks.map((track) => (
                                    <option key={track.index} value={track.index}>
                                        🎵 {track.label}
                                    </option>
                                ))
                            )}
                        </select>

                        <select
                            className="track-selector"
                            value={selectedSubtitle}
                            onChange={(e) => handleSubtitleChange(parseInt(e.target.value))}
                            title="Subtitles"
                            disabled={textTracks.length === 0}
                        >
                            <option value="-1">💬 Off</option>
                            {textTracks.map((track) => (
                                <option key={track.index} value={track.index}>
                                    💬 {track.label}
                                </option>
                            ))}
                        </select>

                        <select
                            className="speed-selector"
                            value={playbackRate}
                            onChange={(e) => changePlaybackRate(parseFloat(e.target.value))}
                        >
                            <option value="0.5">0.5x</option>
                            <option value="1">1x</option>
                            <option value="1.25">1.25x</option>
                            <option value="1.5">1.5x</option>
                            <option value="2">2x</option>
                        </select>

                        <button className="control-btn" onClick={toggleFullscreen} aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}>
                            {isFullscreen ? (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                                </svg>
                            ) : (
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                                </svg>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            <div className={`meeting-controls-bar ${isInactive && videoFile ? 'hidden' : ''}`}>
                <button
                    className={`meeting-btn ${isMicEnabled ? 'active-lk' : 'disabled-lk'}`}
                        onClick={toggleMic}
                        title={isMicEnabled ? "Turn off microphone" : "Turn on microphone"}
                    >
                        {isMicEnabled ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="1" y1="1" x2="23" y2="23" />
                                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                            </svg>
                        )}
                    </button>

                    <button
                        className={`meeting-btn ${isCamEnabled ? 'active-lk' : 'disabled-lk'}`}
                        onClick={toggleCamera}
                        title={isCamEnabled ? "Turn off camera" : "Turn on camera"}
                    >
                        {isCamEnabled ? (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="23 7 16 12 23 17 23 7" />
                                <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
                            </svg>
                        ) : (
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                                <line x1="1" y1="1" x2="23" y2="23" />
                            </svg>
                        )}
                    </button>

                    <button
                        className={`meeting-btn ${isScreenSharing ? 'active-lk' : ''}`}
                        onClick={toggleScreenShare}
                        title={isScreenSharing ? "Stop presenting" : "Present now"}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                            <line x1="8" y1="21" x2="16" y2="21" />
                            <line x1="12" y1="17" x2="12" y2="21" />
                        </svg>
                    </button>
                    
                    <button
                        className="meeting-btn call-end"
                        onClick={() => { disconnect(); if(onLeave) onLeave(); }}
                        title="Leave call"
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
                            <line x1="23" y1="1" x2="1" y2="23" />
                        </svg>
                    </button>
            </div>
        </div >
    );
}

export default VideoPlayer;
