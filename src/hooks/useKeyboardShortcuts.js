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
                case 's':
                case 'S':
                    e.preventDefault();
                    onStop?.();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (e.ctrlKey) onSeekForward?.(60); // Ctrl + Right: 1m
                    else if (e.altKey) onSeekForward?.(10); // Alt + Right: 10s
                    else onSeekForward?.(5); // Right: 5s
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    if (e.ctrlKey) onSeekBackward?.(60); // Ctrl + Left: 1m
                    else if (e.altKey) onSeekBackward?.(10); // Alt + Left: 10s
                    else onSeekBackward?.(5); // Left: 5s
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
                case 'v':
                case 'V':
                    e.preventDefault();
                    onCycleSubtitles?.();
                    break;
                case 'b':
                case 'B':
                    e.preventDefault();
                    onCycleAudio?.();
                    break;
                case 'j':
                case 'J':
                    e.preventDefault();
                    onSlowDown?.();
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    onSpeedUp?.();
                    break;
                case 'k':
                case 'K':
                    e.preventDefault();
                    onResetSpeed?.();
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
