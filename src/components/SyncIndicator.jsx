import './SyncIndicator.css';

function SyncIndicator({ status }) {
    // Don't render if status is unknown or undefined
    if (!status || status === 'unknown') {
        return null;
    }

    const getStatusConfig = () => {
        switch (status) {
            case 'synced':
                return { label: 'Synced', color: 'var(--color-success)' };
            case 'syncing':
                return { label: 'Syncing...', color: 'var(--color-warning)' };
            case 'disconnected':
                return { label: 'Disconnected', color: 'var(--color-error)' };
            default:
                return null;
        }
    };

    const config = getStatusConfig();
    if (!config) return null;

    return (
        <div className="sync-indicator">
            <div className="indicator-pill glass">
                <div
                    className={`status-dot ${status === 'syncing' ? 'pulse' : ''}`}
                    style={{ backgroundColor: config.color }}
                />
                <span>{config.label}</span>
            </div>
        </div>
    );
}

export default SyncIndicator;
