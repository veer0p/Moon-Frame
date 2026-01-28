import { useState, useRef, useEffect } from 'react';
import { generateUsername } from '../utils/helpers';
import './LandingScreen.css';

const DEFAULT_ROOM_CODE = 'WATCH1'; // Default room everyone can join

function LandingScreen({ onCreateRoom, onJoinRoom }) {
    const [mode, setMode] = useState(null); // null | 'create' | 'join'
    const [roomCode, setRoomCode] = useState('');
    const [username, setUsername] = useState('');
    const fileInputRef = useRef(null);

    // Load saved data from localStorage
    useEffect(() => {
        const savedUsername = localStorage.getItem('watch-together-username');
        const savedRoomCode = localStorage.getItem('watch-together-last-room');

        if (savedUsername) {
            setUsername(savedUsername);
        }
        if (savedRoomCode) {
            setRoomCode(savedRoomCode);
        }
    }, []);

    const handleFileSelect = async () => {
        // Check if running in Electron
        if (window.electronAPI && window.electronAPI.selectVideo) {
            const filePath = await window.electronAPI.selectVideo();
            if (!filePath) return;

            // Use custom protocol for streaming
            const videoUrl = `video://${filePath}`;
            const fileName = filePath.split(/[\\/]/).pop();

            // Create a mock File object that VideoPlayer can use
            // We attach the custom URL to it
            const file = {
                name: fileName,
                type: 'video/mp4', // Default type, player will handle it
                size: 0, // Unknown size, doesn't matter for streaming
                previewUrl: videoUrl // Custom property we'll use in VideoPlayer
            };

            const finalUsername = username.trim() || generateUsername();

            // Save username to localStorage
            localStorage.setItem('watch-together-username', finalUsername);

            if (mode === 'create') {
                onCreateRoom(file, finalUsername);
            } else if (mode === 'join' && roomCode.trim()) {
                // Save last joined room
                localStorage.setItem('watch-together-last-room', roomCode.trim().toUpperCase());
                onJoinRoom(roomCode.trim().toUpperCase(), file, finalUsername);
            } else if (mode === 'default') {
                // Join default room
                localStorage.setItem('watch-together-last-room', DEFAULT_ROOM_CODE);
                onJoinRoom(DEFAULT_ROOM_CODE, file, finalUsername);
            }
        } else {
            // Fallback to file input for web version
            fileInputRef.current?.click();
        }
    };

    const handleWebFileSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const finalUsername = username.trim() || generateUsername();

        // Save username to localStorage
        localStorage.setItem('watch-together-username', finalUsername);

        if (mode === 'create') {
            onCreateRoom(file, finalUsername);
        } else if (mode === 'join' && roomCode.trim()) {
            // Save last joined room
            localStorage.setItem('watch-together-last-room', roomCode.trim().toUpperCase());
            onJoinRoom(roomCode.trim().toUpperCase(), file, finalUsername);
        } else if (mode === 'default') {
            // Join default room
            localStorage.setItem('watch-together-last-room', DEFAULT_ROOM_CODE);
            onJoinRoom(DEFAULT_ROOM_CODE, file, finalUsername);
        }
    };

    const handleCreateClick = async () => {
        setMode('create');
        await handleFileSelect();
    };

    const handleJoinClick = async () => {
        if (mode === 'join' && roomCode.trim()) {
            await handleFileSelect();
        } else {
            setMode('join');
        }
    };

    const handleDefaultRoomClick = async () => {
        setMode('default');
        await handleFileSelect();
    };

    const handleUsernameChange = (e) => {
        const newUsername = e.target.value;
        setUsername(newUsername);
        if (newUsername.trim()) {
            localStorage.setItem('watch-together-username', newUsername.trim());
        }
    };

    return (
        <div className="landing-screen">
            <div className="landing-background">
                <div className="gradient-orb orb-1"></div>
                <div className="gradient-orb orb-2"></div>
                <div className="gradient-orb orb-3"></div>
            </div>

            <div className="landing-content fade-in">
                <div className="landing-header">
                    <h1 className="landing-title">Watch Together</h1>
                    <p className="landing-subtitle">
                        Share moments, stay connected
                    </p>
                </div>

                <div className="landing-actions">
                    <input
                        type="text"
                        className="room-code-input"
                        placeholder="Your name (optional)"
                        value={username}
                        onChange={handleUsernameChange}
                        maxLength={20}
                        style={{ marginBottom: 'var(--space-md)' }}
                    />

                    {/* Default Room - Quick Join */}
                    <button
                        className="btn btn-primary btn-large"
                        onClick={handleDefaultRoomClick}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Join Default Room ({DEFAULT_ROOM_CODE})
                    </button>

                    <div className="divider">
                        <span>or</span>
                    </div>

                    <div className="button-row">
                        <button
                            className="btn btn-secondary btn-half"
                            onClick={handleCreateClick}
                        >
                            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                <path d="M10 4V16M4 10H16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                            Create Room
                        </button>

                        {mode === 'join' ? (
                            <div className="join-form-inline">
                                <input
                                    type="text"
                                    className="room-code-input-small"
                                    placeholder="CODE"
                                    value={roomCode}
                                    onChange={(e) => setRoomCode(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleJoinClick()}
                                    autoFocus
                                    maxLength={6}
                                />
                                <button
                                    className="btn btn-secondary btn-icon"
                                    onClick={handleJoinClick}
                                    disabled={!roomCode.trim()}
                                    title="Join"
                                >
                                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                        <path d="M4 10h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-secondary btn-half"
                                onClick={() => setMode('join')}
                            >
                                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                                    <path d="M15 10L10 15M10 15L5 10M10 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                </svg>
                                Join Room
                            </button>
                        )}
                    </div>
                </div>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleWebFileSelect}
                    style={{ display: 'none' }}
                />
            </div>
        </div>
    );
}

export default LandingScreen;
