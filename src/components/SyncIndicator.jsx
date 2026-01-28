import './SyncIndicator.css';

function SyncIndicator({ status }) {
    const getStatusConfig = () => {
        switch (status) {
            case 'synced':
                return { label: 'Synced', color: 'var(--color-success)' };
            case 'syncing':
                return { label: 'Syncing...', color: 'var(--color-warning)' };
            case 'disconnected':
                return { label: 'Disconnected', color: 'var(--color-error)' };
            default:
                return { label: 'Unknown', color: 'var(--color-text-tertiary)' };
        }
    };

    const config = getStatusConfig();

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
