import { useState, useEffect } from 'react';
import VideoPlayer from './VideoPlayer';
import ChatPanel from './ChatPanel';
import SyncNotification from './SyncNotification';
import SyncIndicator from './SyncIndicator';
import UserList from './UserList';
import Toast from './Toast';
import { supabase } from '../lib/supabase';
import { useRoom } from '../hooks/useRoom';
import { useChat } from '../hooks/useChat';
import { usePresence } from '../hooks/usePresence';
import { useNotifications } from '../hooks/useNotifications';
import { generateRoomCode } from '../utils/helpers';
import { EmojiShower } from './EmojiTray';
import { useEmojiReactions } from '../hooks/useEmojiReactions';
import './WatchRoom.css';

function WatchRoom({ roomId: initialRoomId, videoFile, onVideoFileSelect, username, onLeave }) {
    const [roomCode, setRoomCode] = useState(initialRoomId);
    const [notification, setNotification] = useState(null);
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);

    const { roomState, updateRoom, isConnected } = useRoom(roomCode, username, videoFile);
    const { messages, sendMessage } = useChat(roomCode);
    const { activeUsers, userCount } = usePresence(roomCode, username);
    const { success, warning, info } = useNotifications();
    const { showerEmojis, triggerShower } = useEmojiReactions(roomCode);

    // Create room if no roomId provided (user clicked "Create Room")
    useEffect(() => {
        const createRoom = async () => {
            if (!initialRoomId && !isCreatingRoom) {
                setIsCreatingRoom(true);
                const newCode = generateRoomCode();

                const { error } = await supabase
                    .from('rooms')
                    .insert({
                        room_code: newCode,
                        is_playing: false,
                        video_time: 0,
                        playback_rate: 1.0,
                        last_action_by: username
                    });

                if (!error) {
                    setRoomCode(newCode);
                    success(`Room created: ${newCode}`);
                } else {
                    console.error('Error creating room:', error);
                    warning('Failed to create room');
                }
            }
        };

        createRoom();
    }, [initialRoomId, username, isCreatingRoom, success, warning]);

    // Save roomCode to sessionStorage so it survives refreshes
    useEffect(() => {
        if (roomCode) {
            sessionStorage.setItem('roomId', roomCode);
        }
    }, [roomCode]);

    // Monitor user count changes
    useEffect(() => {
        if (userCount === 1) {
            info('You are alone in the room. Waiting for others to join...');
        } else if (userCount > 1) {
            // Check if someone just joined
            const prevCount = activeUsers.length;
            if (prevCount < userCount) {
                success(`${activeUsers[activeUsers.length - 1]?.username} joined the room`);
            }
        }
    }, [userCount, activeUsers, info, success]);

    const showNotification = (message) => {
        setNotification(message);
        setTimeout(() => setNotification(null), 3000);
    };

    const handleLeave = () => {
        // Mark as inactive before leaving
        supabase
            .from('room_presence')
            .update({ is_active: false })
            .eq('room_code', roomCode)
            .eq('username', username)
            .then(() => {
                onLeave();
            });
    };

    return (
        <div className={`watch-room ${isFullscreenMode ? 'fullscreen-mode' : ''} ${!showSidebar ? 'sidebar-hidden' : ''}`}>
            <Toast />
            <EmojiShower particles={showerEmojis} />

            <div className="watch-content">
                <div className="video-section">
                    <VideoPlayer
                        videoFile={videoFile}
                        onVideoFileSelect={onVideoFileSelect}
                        roomState={roomState}
                        updateRoom={updateRoom}
                        username={username}
                        userCount={userCount}
                        messages={messages}
                        onSendMessage={(text) => sendMessage(username, text)}
                        onEmojiReaction={triggerShower}
                        onFullscreenChange={(isFullscreen) => setIsFullscreenMode(isFullscreen)}
                        roomCode={roomCode}
                        isConnected={isConnected}
                        showSidebar={showSidebar}
                        onToggleChat={() => setShowSidebar(prev => !prev)}
                        onLeave={handleLeave}
                    />
                    {notification && <SyncNotification message={notification} />}
                </div>

                <div className="sidebar">
                    <UserList users={activeUsers} currentUsername={username} />
                    <ChatPanel
                        messages={messages}
                        onSendMessage={(text) => sendMessage(username, text)}
                        currentUsername={username}
                        onEmojiReaction={triggerShower}
                    />
                </div>
            </div>
        </div>
    );
}

export default WatchRoom;
