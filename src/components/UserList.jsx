import './UserList.css';

function UserList({ users, currentUsername }) {
    const getUserInitials = (username) => {
        return username.substring(0, 2).toUpperCase();
    };

    const getUserColor = (username) => {
        // Generate consistent color based on username
        let hash = 0;
        for (let i = 0; i < username.length; i++) {
            hash = username.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 60%)`;
    };

    return (
        <div className="user-list">
            <div className="user-list-header">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M13 7C13 8.65685 11.6569 10 10 10C8.34315 10 7 8.65685 7 7C7 5.34315 8.34315 4 10 4C11.6569 4 13 5.34315 13 7Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M5 16C5 13.7909 6.79086 12 9 12H11C13.2091 12 15 13.7909 15 16V17H5V16Z" stroke="currentColor" strokeWidth="2" />
                </svg>
                <span className="user-count">{users.length} watching</span>
            </div>
            <div className="user-list-items">
                {users.map((user) => (
                    <div
                        key={user.username}
                        className={`user-item ${user.username === currentUsername ? 'current-user' : ''}`}
                    >
                        <div
                            className="user-avatar"
                            style={{ background: getUserColor(user.username) }}
                        >
                            {getUserInitials(user.username)}
                        </div>
                        <span className="user-name">
                            {user.username}
                            {user.username === currentUsername && ' (You)'}
                        </span>
                        <div className="user-status"></div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default UserList;
