import './ChatMessage.css';

function ChatMessage({ message }) {
    const isOwn = message.sender === 'you';

    // Get the display name - use actual username from message if available
    const displayName = message.username || (isOwn ? 'You' : 'Partner');

    return (
        <div className={`chat-message ${isOwn ? 'own' : 'partner'}`}>
            <div className="message-sender">
                {displayName}
            </div>
            <div className="message-bubble">
                <p>{message.text}</p>
            </div>
        </div>
    );
}

export default ChatMessage;
