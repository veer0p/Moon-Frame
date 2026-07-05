import { useState, useEffect, useRef } from 'react';
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
import { useMediaQuery } from '../hooks/useMediaQuery';
import * as Tabs from '@radix-ui/react-tabs';
import { Drawer } from 'vaul';
import { Users, MessageSquare } from 'lucide-react';
import './WatchRoom.css';

function WatchRoom({ roomId: initialRoomId, videoFile, onVideoFileSelect, username, onLeave }) {
    const [roomCode, setRoomCode] = useState(initialRoomId);
    const [notification, setNotification] = useState(null);
    const [isCreatingRoom, setIsCreatingRoom] = useState(false);
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [showSidebar, setShowSidebar] = useState(window.innerWidth > 1024);
    const [unreadCount, setUnreadCount] = useState(0);
    const [messagePreview, setMessagePreview] = useState(null);

    const { roomState, updateRoom, isConnected } = useRoom(roomCode, username, videoFile);
    const { messages, sendMessage } = useChat(roomCode);
    const { activeUsers, userCount } = usePresence(roomCode, username);
    const { success, warning, info } = useNotifications();
    const { showerEmojis, triggerShower } = useEmojiReactions(roomCode);
    const isMobile = useMediaQuery('(max-width: 1024px)');
    const sidebarRef = useRef(null);

    // Track unread messages and previews
    useEffect(() => {
        if (!showSidebar && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.username !== username) {
                setUnreadCount(prev => prev + 1);
                setMessagePreview(lastMessage);
                const timer = setTimeout(() => setMessagePreview(null), 3000);
                return () => clearTimeout(timer);
            }
        } else if (showSidebar) {
            setUnreadCount(0);
            setMessagePreview(null);
        }
    }, [messages, showSidebar, username]);

    // Close sidebar on click outside (mobile behavior)
    useEffect(() => {
        if (!isMobile || !showSidebar) return;

        const handleClickOutside = (e) => {
            // Check if click is outside sidebar or on the toggle button
            if (
                sidebarRef.current && 
                !sidebarRef.current.contains(e.target) &&
                !e.target.closest('.chat-toggle-btn') &&
                !e.target.closest('.chat-emoji-picker-popover') // don't close if clicking emoji picker
            ) {
                setShowSidebar(false);
            }
        };

        // Use capture phase to ensure it runs before React's synthetic events might stop propagation
        document.addEventListener('mousedown', handleClickOutside, true);
        document.addEventListener('touchstart', handleClickOutside, true);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
            document.removeEventListener('touchstart', handleClickOutside, true);
        };
    }, [isMobile, showSidebar]);

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
                        unreadCount={unreadCount}
                        messagePreview={messagePreview}
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

                {/* Sidebar Content rendered in Tabs */}
                {(() => {
                    const SidebarContent = (
                        <Tabs.Root className="tabs-root" defaultValue="chat">
                            <Tabs.List className="tabs-list">
                                <Tabs.Trigger className="tabs-trigger" value="chat">
                                    <MessageSquare size={16} /> Chat
                                </Tabs.Trigger>
                                <Tabs.Trigger className="tabs-trigger" value="users">
                                    <Users size={16} /> Participants ({userCount})
                                </Tabs.Trigger>
                            </Tabs.List>
                            <Tabs.Content className="tabs-content" value="chat">
                                <ChatPanel
                                    messages={messages}
                                    onSendMessage={(text) => sendMessage(username, text)}
                                    currentUsername={username}
                                    onEmojiReaction={triggerShower}
                                />
                            </Tabs.Content>
                            <Tabs.Content className="tabs-content" value="users">
                                <UserList users={activeUsers} currentUsername={username} />
                            </Tabs.Content>
                        </Tabs.Root>
                    );

                    return (
                        <div ref={sidebarRef} className={`sidebar ${!showSidebar ? 'hidden' : ''} ${isMobile ? 'floating-mobile-sidebar' : ''}`}>
                            {SidebarContent}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}

export default WatchRoom;
