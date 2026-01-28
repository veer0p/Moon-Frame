import { useEffect } from 'react';

function useKeyboardShortcuts({
    onPlayPause,
    onSeekForward,
    onSeekBackward,
    onVolumeUp,
    onVolumeDown,
    onMute,
    onFullscreen,
}) {
    useEffect(() => {
        const handleKeyDown = (e) => {
            // Ignore if user is typing in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    onPlayPause?.();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    onSeekForward?.();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    onSeekBackward?.();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    onVolumeUp?.();
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    onVolumeDown?.();
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    onMute?.();
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    onFullscreen?.();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onPlayPause, onSeekForward, onSeekBackward, onVolumeUp, onVolumeDown, onMute, onFullscreen]);
}

export default useKeyboardShortcuts;
