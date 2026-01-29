import { useState, useRef, useEffect } from 'react';
import ChatPanel from './ChatPanel';
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts';
import useInactivityTimer from '../hooks/useInactivityTimer';
import { useVideoSync } from '../hooks/useVideoSync';
import formatTime from '../utils/formatTime';
import './VideoPlayer.css';

function VideoPlayer({ videoFile, roomState, updateRoom, username, userCount = 1, messages = [], onSendMessage }) {
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

    const containerRef = useRef(null);
    const feedbackTimeoutRef = useRef(null); // Track feedback timeout for debouncing
    const cumulativeSeekRef = useRef(0); // Track cumulative seek amount
    const seekResetTimeoutRef = useRef(null); // Reset cumulative seek after inactivity
    const { isInactive } = useInactivityTimer(containerRef, 3000);
    const { syncPlay, syncPause, syncSeek, syncPlaybackRate } = useVideoSync(
        videoRef,
        roomState,
        updateRoom,
        username,
        userCount
    );

    useEffect(() => {
        if (videoFile && videoRef.current) {
            console.log('Loading video file:', videoFile.name);
            setHasError(false);
            setErrorMessage('');

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
                        if (videoFile?.type === 'video/mp4') {
                            setErrorMessage('MP4 file has unsupported codecs (likely HEVC/H.265). Please re-encode with H.264 video and AAC audio.');
                        } else {
                            setErrorMessage('Video format not supported. Please use MP4 with H.264 video and AAC audio.');
                        }
                    } else {
                        setErrorMessage('Video format not supported. Please use MP4, WebM, or OGG format.');
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
        if (!document.fullscreenElement) {
            containerRef.current?.requestFullscreen();
            setIsFullscreen(true);
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
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
        onSeekForward: (amount = 10) => handleSeek(Math.min(currentTime + amount, duration), amount),
        onSeekBackward: (amount = 10) => handleSeek(Math.max(currentTime - amount, 0), -amount),
        onVolumeUp: () => handleVolumeChange(Math.min(volume + 0.1, 1)),
        onVolumeDown: () => handleVolumeChange(Math.max(volume - 0.1, 0)),
        onMute: toggleMute,
        onFullscreen: toggleFullscreen,
        onCycleSubtitles: handleCycleSubtitles,
        onCycleAudio: handleCycleAudioTrack,
        onSlowDown: () => changePlaybackRate(Math.max(playbackRate - 0.25, 0.25)),
        onSpeedUp: () => changePlaybackRate(Math.min(playbackRate + 0.25, 4)),
        onResetSpeed: () => changePlaybackRate(1),
        onToggleChat: () => isFullscreen && setShowChat(prev => !prev),
    });

    return (
        <div ref={containerRef} className="video-player">
            {!videoFile && (
                <div className="video-placeholder">
                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
                        <path d="M14.752 11.168L20.87 7.542C21.5291 7.15705 22.3589 7.14074 23.0341 7.49963C23.7092 7.85852 24.1167 8.53305 24.1 9.266V14.734C24.1167 15.467 23.7092 16.1415 23.0341 16.5004C22.3589 16.8593 21.5291 16.8429 20.87 16.458L14.752 12.832C14.1169 12.4632 13.7207 11.7923 13.7207 11.07C13.7207 10.3477 14.1169 9.67684 14.752 9.308V11.168Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M2 6C2 4.89543 2.89543 4 4 4H12C13.1046 4 14 4.89543 14 6V18C14 19.1046 13.1046 20 12 20H4C2.89543 20 2 19.1046 2 18V6Z" stroke="currentColor" strokeWidth="2" />
                    </svg>
                    <p>No video loaded</p>
                    <span>Select a video file to start watching</span>
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
                        <strong>Supported formats:</strong> MP4 (H.264 + AAC), WebM, OGG
                    </div>
                    <div className="conversion-help">
                        <strong>Quick fix:</strong>
                        <code>ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4</code>
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

            <video
                ref={videoRef}
                className="video-element"
                onClick={videoFile ? togglePlay : undefined}
                onDoubleClick={videoFile ? toggleFullscreen : undefined}
                style={{ display: videoFile && !hasError ? 'block' : 'none', cursor: videoFile ? 'pointer' : 'default' }}
            />

            {isFullscreen && (
                <div className={`fullscreen-chat-overlay ${!showChat ? 'hidden' : ''}`}>
                    <ChatPanel
                        messages={messages}
                        onSendMessage={onSendMessage}
                        currentUsername={username}
                    />
                </div>
            )}

            <div className={`video-controls glass ${isInactive || !videoFile ? 'hidden' : ''}`}>
                <div className="timeline-container">
                    <div
                        className="timeline-progress"
                        style={{ width: `${(currentTime / duration) * 100}%` }}
                    />
                    <div
                        className="buffered-indicator"
                        style={{ width: `${(buffered / duration) * 100}%` }}
                    />
                    <input
                        type="range"
                        className="timeline"
                        min="0"
                        max={duration || 0}
                        value={currentTime}
                        onChange={(e) => handleSeek(parseFloat(e.target.value))}
                        aria-label="Video timeline"
                        aria-valuemin="0"
                        aria-valuemax={duration || 0}
                        aria-valuenow={currentTime}
                        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
                    />
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
                            {formatTime(currentTime)} / {formatTime(duration)}
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
        </div >
    );
}

export default VideoPlayer;
