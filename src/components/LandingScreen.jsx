import { useState, useRef, useEffect } from 'react';
import { generateUsername } from '../utils/helpers';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import LastWatched from './LastWatched';
import './LandingScreen.css';

const DEFAULT_ROOM_CODE = 'WATCH1'; // Default room everyone can join

function LandingScreen({ onCreateRoom, onJoinRoom }) {
    const [mode, setMode] = useState(null); // null | 'create' | 'join'
    const [roomCode, setRoomCode] = useState('');
    const [username, setUsername] = useState('');
    const [lastWatched, setLastWatched] = useState([]);
    const [loadingLastWatched, setLoadingLastWatched] = useState(true);
    const fileInputRef = useRef(null);
    const { user, signOut } = useAuth();

    // Load saved data from localStorage
    useEffect(() => {
        const savedUsername = localStorage.getItem('watch-together-username');
        const savedRoomCode = localStorage.getItem('watch-together-last-room');

        if (savedUsername) {
            setUsername(savedUsername);
        } else if (user) {
            const defaultName = user.email.split('@')[0];
            setUsername(defaultName);
        }

        if (savedRoomCode) {
            setRoomCode(savedRoomCode);
        }

        // Fetch last watched rooms
        if (user) {
            const fetchLastWatched = async () => {
                const { data } = await supabase
                    .from('last_watched')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('updated_at', { ascending: false })
                    .limit(5);

                if (data) {
                    setLastWatched(data);
                }
                setLoadingLastWatched(false);
            };
            fetchLastWatched();
        } else {
            setLoadingLastWatched(false);
        }
    }, [user]);

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

            <header className="landing-header-nav glass">
                <div className="nav-logo">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="logo-text">Moon Frame</span>
                </div>
                <div className="nav-user">
                    <div className="user-info">
                        <div className="user-avatar">{user?.email?.[0].toUpperCase()}</div>
                        <span className="user-email">{user?.email}</span>
                    </div>
                    <button className="logout-btn-premium" onClick={() => signOut()}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                        Logout
                    </button>
                </div>
            </header>

            <main className="landing-main">
                <section className="hero-section">
                    <h1 className="hero-title">Watch Together, <span className="text-gradient">Anywhere.</span></h1>
                    <p className="hero-subtitle">
                        Experience movies and videos with friends in real-time.
                        Sync playback, chat, and share moments together.
                    </p>
                </section>

                <div className={`layout-container ${lastWatched.length > 0 ? 'split-layout' : 'centered-layout'}`}>
                    {lastWatched.length > 0 && (
                        <div className="layout-left">
                            <LastWatched lastWatched={lastWatched} onJoinRoom={onJoinRoom} />
                        </div>
                    )}

                    <div className="layout-right">
                        <div className="action-container glass">
                            <div className="username-field">
                                <label>Display Name</label>
                                <input
                                    type="text"
                                    className="premium-input"
                                    placeholder="How should others see you?"
                                    value={username}
                                    onChange={handleUsernameChange}
                                    maxLength={20}
                                />
                            </div>

                            <div className="primary-actions">
                                <button
                                    className="btn-premium btn-primary-premium"
                                    onClick={handleDefaultRoomClick}
                                >
                                    <div className="btn-content">
                                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                        <span>Join Default Room</span>
                                        <span className="room-badge">{DEFAULT_ROOM_CODE}</span>
                                    </div>
                                </button>

                                <div className="action-divider">
                                    <span>OR</span>
                                </div>

                                <div className="secondary-actions-grid">
                                    <button
                                        className="btn-premium btn-secondary-premium"
                                        onClick={handleCreateClick}
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                                        </svg>
                                        Create Room
                                    </button>

                                    {mode === 'join' ? (
                                        <div className="join-input-group">
                                            <input
                                                type="text"
                                                className="premium-input-small"
                                                placeholder="CODE"
                                                value={roomCode}
                                                onChange={(e) => setRoomCode(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleJoinClick()}
                                                autoFocus
                                                maxLength={6}
                                            />
                                            <button
                                                className="btn-icon-premium"
                                                onClick={handleJoinClick}
                                                disabled={!roomCode.trim()}
                                            >
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                </svg>
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            className="btn-premium btn-secondary-premium"
                                            onClick={() => setMode('join')}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                            </svg>
                                            Join Room
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleWebFileSelect}
                style={{ display: 'none' }}
            />
        </div>
    );
}

export default LandingScreen;
