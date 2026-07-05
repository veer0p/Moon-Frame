import './EmojiTray.css';

const EMOJIS = ['😂', '❤️', '🤦‍♂️', '💖', '😶‍🌫️', '🫠', '☠️', '🥵', '💋', '🫦', '🤤'];

function EmojiTray({ onEmojiClick }) {
    return (
        <div className="emoji-tray">
            {EMOJIS.map((emoji) => (
                <button
                    key={emoji}
                    className="emoji-tray-btn"
                    onClick={() => onEmojiClick(emoji)}
                    title={emoji}
                >
                    {emoji}
                </button>
            ))}
        </div>
    );
}

function EmojiShower({ particles }) {
    if (particles.length === 0) return null;

    return (
        <div className="emoji-shower-overlay">
            {particles.map((p) => (
                <span
                    key={p.id}
                    className="emoji-particle"
                    style={{
                        left: `${p.left}%`,
                        fontSize: `${p.size}rem`,
                        animationDuration: `${p.duration}s`,
                        animationDelay: `${p.delay}s`,
                        '--rotation': `${p.rotation}deg`,
                        '--rotation-speed': `${p.rotationSpeed}deg`,
                        '--wobble': `${p.wobble}px`,
                        '--size': p.size,
                    }}
                >
                    {p.emoji}
                </span>
            ))}
        </div>
    );
}

export { EmojiTray, EmojiShower };
