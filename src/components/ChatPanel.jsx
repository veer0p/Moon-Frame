import { useState, useRef, useEffect } from 'react';
import ChatMessage from './ChatMessage';
import { EmojiTray } from './EmojiTray';
import './ChatPanel.css';

function ChatPanel({ messages, onSendMessage, currentUsername, onEmojiReaction }) {
    const [inputValue, setInputValue] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const messagesEndRef = useRef(null);
    const emojiPickerRef = useRef(null);
    const toggleButtonRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (
                emojiPickerRef.current && 
                !emojiPickerRef.current.contains(event.target) &&
                toggleButtonRef.current &&
                !toggleButtonRef.current.contains(event.target)
            ) {
                setShowEmojiPicker(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('touchstart', handleClickOutside);
        };
    }, []);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (inputValue.trim()) {
            onSendMessage(inputValue.trim());
            setInputValue('');
            setShowEmojiPicker(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="chat-panel glass">

            <div className="messages-container">
                {messages.length === 0 ? (
                    <div className="empty-state">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                            <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                        <p>No messages yet</p>
                        <span>Start the conversation!</span>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <ChatMessage
                                key={msg.id}
                                message={{
                                    id: msg.id,
                                    sender: msg.username === currentUsername ? 'you' : 'partner',
                                    username: msg.username,
                                    text: msg.message,
                                    timestamp: new Date(msg.created_at)
                                }}
                            />
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            <div className="chat-footer">
                {showEmojiPicker && onEmojiReaction && (
                    <div ref={emojiPickerRef} className="chat-emoji-picker-popover">
                        <EmojiTray onEmojiClick={onEmojiReaction} />
                    </div>
                )}
                <form className="chat-input-container" onSubmit={handleSubmit}>
                    <div className="chat-input-wrapper">
                        <input
                            type="text"
                            className="chat-input"
                            placeholder="Type a message..."
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            ref={toggleButtonRef}
                            type="button"
                            className="emoji-toggle-btn"
                            onClick={() => setShowEmojiPicker(prev => !prev)}
                            title="Insert Emoji"
                            aria-label="Toggle emoji picker"
                        >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                <line x1="9" y1="9" x2="9.01" y2="9" />
                                <line x1="15" y1="9" x2="15.01" y2="9" />
                            </svg>
                        </button>
                    </div>
                    <button
                        type="submit"
                        className="send-btn"
                        disabled={!inputValue.trim()}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M18 2L9 11M18 2L12 18L9 11M18 2L2 8L9 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ChatPanel;
