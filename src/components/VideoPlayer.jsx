import { useState, useRef, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import SyncIndicator from './SyncIndicator';
import { EmojiTray } from './EmojiTray';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useInactivityTimer from '../hooks/useInactivityTimer';
import { useVideoSync } from '../hooks/useVideoSync';
import { useLiveKit } from '../hooks/useLiveKit';
import LiveKitOverlay, { TrackVideo } from './LiveKitOverlay';
import formatTime from '../utils/formatTime';
import { Copy, Film, MessageSquare, LogOut, Play, Pause, Volume2, Volume1, VolumeX, Maximize, Minimize, Mic, MicOff, Video as VideoIcon, VideoOff, MonitorUp, PhoneOff, FastForward, Rewind, AlertCircle, Users, Plus } from 'lucide-react';
import { Drawer } from 'vaul';
import * as Tabs from '@radix-ui/react-tabs';
import './VideoPlayer.css';

function VideoPlayer({
    videoFile,
    onVideoFileSelect,
    roomState,
    updateRoom,
    username,
    userCount = 1,
    messages = [],
    unreadCount = 0,
    messagePreview = null,
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
    const [showEmojiTray, setShowEmojiTray] = useState(false);
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



    const volumeRef = useRef(volume);
    const isMutedRef = useRef(isMuted);
    const playbackRateRef = useRef(playbackRate);

    // Keep refs in sync with state
    useEffect(() => {
        volumeRef.current = volume;
        isMutedRef.current = isMuted;
        playbackRateRef.current = playbackRate;
    }, [volume, isMuted, playbackRate]);



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
        triggerFeedback('copy', 'Room Code Copied!', <Copy size={24} />);
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

    // Sync React states (volume, isMuted, playbackRate) with the video DOM element
    useEffect(() => {
        const video = videoRef.current;
        if (video) {
            video.volume = volume;
            video.muted = isMuted;
            video.playbackRate = playbackRate;
        }
    }, [volume, isMuted, playbackRate, videoFile]);

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

            // Apply volume, muted, and playbackRate from the refs to override browser default state resets
            video.volume = volumeRef.current;
            video.muted = isMutedRef.current;
            video.playbackRate = playbackRateRef.current;

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
            triggerFeedback('play', null, <Play size={64} fill="currentColor" />);
            if (updateRoom) syncPlay();
        } else {
            video.pause();
            // isPlaying state will be updated by 'pause' event listener
            triggerFeedback('pause', null, <Pause size={64} fill="currentColor" />);
            if (updateRoom) syncPause();
        }
    };

    const handleSeek = (time, amount) => {
        const video = videoRef.current;
        if (!video) return;

        // For remuxed files, seeking requires changing the src URL
        // FFmpeg restarts at the new position via ?t= parameter
        if (videoFile?.needsRemux) {
            const seekTarget = amount ? (timeOffset + currentTime + amount) : time;
            const clampedTarget = Math.max(0, Math.min(seekTarget, (videoFile.mediaDuration || duration)));
            setTimeOffset(clampedTarget);
            setCurrentTime(0);
            setIsLoading(true);
            
            let newUrl;
            if (videoFile.previewUrl) {
                const baseUrl = videoFile.previewUrl.split('&t=')[0];
                newUrl = `${baseUrl}&t=${clampedTarget}`;
            } else {
                newUrl = `video://${videoFile.filePath}?t=${clampedTarget}`;
            }
            
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
            const icon = isForward ? <FastForward size={64} fill="currentColor" /> : <Rewind size={64} fill="currentColor" />;
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

    const handleSelectVideoFile = async (e) => {
        if (window.electronAPI && window.electronAPI.selectVideo) {
            try {
                const filePath = await window.electronAPI.selectVideo();
                if (!filePath) return;

                const videoUrl = `video://${filePath}`;
                const fileName = filePath.split(/[\\/]/).pop();
                const ext = fileName.split('.').pop().toLowerCase();

                const mimeTypes = {
                    'mp4': 'video/mp4', 'm4v': 'video/mp4',
                    'webm': 'video/webm',
                    'ogg': 'video/ogg', 'ogv': 'video/ogg',
                    'mov': 'video/quicktime',
                    'avi': 'video/x-msvideo',
                    'mkv': 'video/x-matroska',
                    'flv': 'video/x-flv',
                    'wmv': 'video/x-ms-wmv',
                    'mpg': 'video/mpeg', 'mpeg': 'video/mpeg',
                    '3gp': 'video/3gpp',
                    'ts': 'video/mp2t', 'm2ts': 'video/mp2t',
                };

                let videoInfo = { duration: 0, needsRemux: false, videoCodec: 'unknown', audioCodec: 'unknown' };
                if (window.electronAPI.getVideoInfo) {
                    try {
                        videoInfo = await window.electronAPI.getVideoInfo(filePath);
                    } catch (err) {
                        console.warn('Failed to get video info:', err);
                    }
                }

                const file = {
                    name: fileName,
                    type: mimeTypes[ext] || 'video/mp4',
                    size: 0,
                    previewUrl: videoUrl,
                    filePath: filePath,
                    needsRemux: videoInfo.needsRemux || false,
                    mediaDuration: videoInfo.duration || 0,
                    videoCodec: videoInfo.videoCodec || 'unknown',
                    audioCodec: videoInfo.audioCodec || 'unknown',
                };

                if (onVideoFileSelect) {
                    onVideoFileSelect(file);
                }
            } catch (err) {
                console.error("Error in Electron file select:", err);
            }
        } else {
            const file = e?.target?.files?.[0];
            if (file) {
                // Fetch video details from local Vite dev server first
                try {
                    const response = await fetch(`/api/video-info?filename=${encodeURIComponent(file.name)}`);
                    if (response.ok) {
                        const info = await response.json();
                        if (info.needsRemux) {
                            const fileWithRemux = {
                                name: file.name,
                                type: file.type || 'video/mp4',
                                size: file.size,
                                previewUrl: `/api/transcode?filename=${encodeURIComponent(file.name)}`,
                                filePath: file.name,
                                needsRemux: true,
                                mediaDuration: info.duration || 0,
                                videoCodec: info.videoCodec || 'unknown',
                                audioCodec: info.audioCodec || 'unknown',
                                rawFile: file
                            };
                            console.log('Selected video file in browser requiring auto-remux:', fileWithRemux);
                            if (onVideoFileSelect) {
                                onVideoFileSelect(fileWithRemux);
                            }
                            return;
                        }
                    }
                } catch (err) {
                    console.warn('Vite video info API is not available (production/static mode). Falling back to native browser playback:', err);
                }

                if (onVideoFileSelect) {
                    onVideoFileSelect(file);
                }
            }
        }
    };

    const triggerFilePicker = () => {
        if (window.electronAPI && window.electronAPI.selectVideo) {
            handleSelectVideoFile();
        } else {
            const input = document.getElementById('room-video-picker-input');
            if (input) input.click();
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
            <input 
                id="room-video-picker-input"
                type="file" 
                accept="video/mp4,video/webm,video/ogg,.mkv,.avi,.flv" 
                onChange={handleSelectVideoFile} 
                style={{ display: 'none' }} 
            />

            {messagePreview && !((isFullscreen ? showChat : showSidebar)) && (
                <div className="message-preview-toast-screen">
                    <span className="preview-user">{messagePreview.username}:</span> 
                    <span className="preview-text">{messagePreview.text}</span>
                </div>
            )}

            <div className={`video-controls-top glass ${(isInactive && videoFile) ? 'hidden' : ''}`}>
                <div className="controls-top-left">
                    <div className="room-code-badge" onClick={handleCopyRoomCode} title="Click to copy Room Code">
                        <span className="room-code-label">Room:</span>
                        <span className="room-code-val">{roomCode}</span>
                        <Copy className="copy-icon" size={14} />
                    </div>
                    {videoFile && <SyncIndicator status={isConnected ? (isLoading ? 'syncing' : 'synced') : 'disconnected'} />}
                </div>
                <div className="controls-top-right">
                    {onVideoFileSelect && (
                        <button
                            className="control-btn change-video-btn"
                            onClick={triggerFilePicker}
                            aria-label={videoFile ? "Change video" : "Choose video"}
                            title={videoFile ? "Change Video" : "Choose Video"}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', width: 'auto', padding: '0 12px' }}
                        >
                            <Film size={18} />
                            <span style={{ fontSize: '13px', fontWeight: '500' }}>{videoFile ? "Change Video" : "Choose Video"}</span>
                        </button>
                    )}
                    <button
                        className={`control-btn chat-toggle-btn ${((isFullscreen ? showChat : showSidebar)) ? 'active' : ''}`}
                        onClick={handleToggleChat}
                        aria-label="Toggle chat"
                        title="Toggle Chat"
                        style={{ position: 'relative' }}
                    >
                        <MessageSquare size={20} />
                        {unreadCount > 0 && !((isFullscreen ? showChat : showSidebar)) && (
                            <span className="unread-badge">{unreadCount}</span>
                        )}
                    </button>
                    <button
                        className="control-btn leave-btn-player"
                        onClick={onLeave}
                        aria-label="Leave room"
                        title="Leave Room"
                    >
                        <LogOut size={20} />
                        <span>Leave</span>
                    </button>
                </div>
            </div>

            {!videoFile && !hasError && connectionState === 'disconnected' && (
                <div className="video-placeholder">
                    {onVideoFileSelect && (
                        <button className="screenshare-toggle-btn glass" style={{ position: 'relative', top: '0', transform: 'none', margin: 'auto' }} onClick={triggerFilePicker}>
                            <Film size={24} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                            Choose Local Video
                        </button>
                    )}
                </div>
            )}


            {hasError && (
                <div className="video-error">
                    <AlertCircle size={64} />
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
                layout={videoFile ? 'floating' : 'grid'}
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
                <div className="quick-emoji-bar">
                    {['❤️', '😂', '😮', '👏', '🔥'].map(emoji => (
                        <button 
                            key={emoji} 
                            className="quick-emoji-btn" 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onEmojiReaction) onEmojiReaction(emoji);
                            }}
                            title={`Send ${emoji}`}
                        >
                            {emoji}
                        </button>
                    ))}
                    <button
                        className="quick-emoji-btn"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowEmojiTray(!showEmojiTray);
                        }}
                        title="More emojis"
                    >
                        <Plus size={20} />
                    </button>
                    
                    {showEmojiTray && (
                        <div className="emoji-tray-popover" onClick={(e) => e.stopPropagation()}>
                            <EmojiTray onEmojiClick={(emoji) => {
                                if (onEmojiReaction) onEmojiReaction(emoji);
                                setShowEmojiTray(false);
                            }} />
                        </div>
                    )}
                </div>

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
                            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
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
                                    <VolumeX size={24} />
                                ) : volume < 0.5 ? (
                                    <Volume1 size={24} />
                                ) : (
                                    <Volume2 size={24} />
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
                            {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
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
                        {isMicEnabled ? <Mic size={24} /> : <MicOff size={24} />}
                    </button>

                    <button
                        className={`meeting-btn ${isCamEnabled ? 'active-lk' : 'disabled-lk'}`}
                        onClick={toggleCamera}
                        title={isCamEnabled ? "Turn off camera" : "Turn on camera"}
                    >
                        {isCamEnabled ? <VideoIcon size={24} /> : <VideoOff size={24} />}
                    </button>

                    <button
                        className={`meeting-btn ${isScreenSharing ? 'active-lk' : ''}`}
                        onClick={toggleScreenShare}
                        title={isScreenSharing ? "Stop presenting" : "Present now"}
                    >
                        <MonitorUp size={24} />
                    </button>
                    
                    {onVideoFileSelect && (
                        <button
                            className="meeting-btn select-video-lk"
                            onClick={triggerFilePicker}
                            title={videoFile ? "Change Video File" : "Choose Video File"}
                        >
                            <Film size={24} />
                        </button>
                    )}
                    
                    <button
                        className="meeting-btn call-end"
                        onClick={() => { disconnect(); if(onLeave) onLeave(); }}
                        title="Leave call"
                    >
                        <PhoneOff size={24} />
                    </button>
            </div>
        </div >
    );
}

export default VideoPlayer;
