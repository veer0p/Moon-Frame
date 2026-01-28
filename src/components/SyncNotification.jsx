import './SyncNotification.css';

function SyncNotification({ message }) {
    return (
        <div className="sync-notification slide-in-down">
            <div className="notification-content glass">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M17 8C17 12.4183 13.4183 16 9 16C4.58172 16 1 12.4183 1 8C1 3.58172 4.58172 0 9 0C13.4183 0 17 3.58172 17 8Z" stroke="currentColor" strokeWidth="2" />
                    <path d="M19 19L14 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <span>{message}</span>
            </div>
        </div>
    );
}

export default SyncNotification;
