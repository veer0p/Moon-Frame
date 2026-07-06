import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import { TrackVideo, TrackAudio } from './LiveKitOverlay';
import './PictureInPicture.css';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 112;
const MAX_WIDTH = 800;
const MAX_HEIGHT = 600;
const DEFAULT_WIDTH = 320;
const DEFAULT_HEIGHT = 180;

export default function PictureInPicture({ participant, onClose, voiceVolume = 1.0 }) {
    const [position, setPosition] = useState({ x: 20, y: 20 });
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const [isDragging, setIsDragging] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [resizeDirection, setResizeDirection] = useState(null);
    const [isMuted, setIsMuted] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [showControls, setShowControls] = useState(false);

    const containerRef = useRef(null);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const initialPos = useRef({ x: 0, y: 0 });
    const resizeStartPos = useRef({ x: 0, y: 0 });
    const initialSize = useRef({ width: 0, height: 0 });
    const initialResizePos = useRef({ x: 0, y: 0 });
    const prevSize = useRef({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const prevPosition = useRef({ x: 20, y: 20 });
    const controlsTimerRef = useRef(null);

    // Position at bottom-right on mount
    useEffect(() => {
        const x = window.innerWidth - DEFAULT_WIDTH - 20;
        const y = window.innerHeight - DEFAULT_HEIGHT - 100;
        setPosition({ x, y });
        prevPosition.current = { x, y };
    }, []);

    // Show/hide controls on hover with timer
    const handleMouseEnter = useCallback(() => {
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
        setShowControls(true);
    }, []);

    const handleMouseLeave = useCallback(() => {
        controlsTimerRef.current = setTimeout(() => {
            if (!isDragging && !isResizing) {
                setShowControls(false);
            }
        }, 1500);
    }, [isDragging, isResizing]);

    // Drag handlers
    const handleDragStart = useCallback((e) => {
        if (e.target.closest('.pip-control-btn') || e.target.closest('.pip-resize-handle')) return;
        e.preventDefault();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        setIsDragging(true);
        dragStartPos.current = { x: clientX, y: clientY };
        initialPos.current = { ...position };
    }, [position]);

    const handleDragMove = useCallback((e) => {
        if (!isDragging) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - dragStartPos.current.x;
        const dy = clientY - dragStartPos.current.y;
        const newX = Math.max(0, Math.min(initialPos.current.x + dx, window.innerWidth - size.width));
        const newY = Math.max(0, Math.min(initialPos.current.y + dy, window.innerHeight - size.height));
        setPosition({ x: newX, y: newY });
    }, [isDragging, size]);

    const handleDragEnd = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Resize handlers
    const handleResizeStart = useCallback((e, direction) => {
        e.preventDefault();
        e.stopPropagation();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        setIsResizing(true);
        setResizeDirection(direction);
        resizeStartPos.current = { x: clientX, y: clientY };
        initialSize.current = { ...size };
        initialResizePos.current = { ...position };
    }, [size, position]);

    const handleResizeMove = useCallback((e) => {
        if (!isResizing) return;
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const dx = clientX - resizeStartPos.current.x;
        const dy = clientY - resizeStartPos.current.y;

        let newWidth = initialSize.current.width;
        let newHeight = initialSize.current.height;
        let newX = initialResizePos.current.x;
        let newY = initialResizePos.current.y;

        if (resizeDirection?.includes('e')) {
            newWidth = Math.max(MIN_WIDTH, Math.min(initialSize.current.width + dx, MAX_WIDTH));
        }
        if (resizeDirection?.includes('w')) {
            const widthDelta = Math.max(MIN_WIDTH, Math.min(initialSize.current.width - dx, MAX_WIDTH)) - initialSize.current.width;
            newWidth = initialSize.current.width + widthDelta;
            newX = initialResizePos.current.x - widthDelta;
        }
        if (resizeDirection?.includes('s')) {
            newHeight = Math.max(MIN_HEIGHT, Math.min(initialSize.current.height + dy, MAX_HEIGHT));
        }
        if (resizeDirection?.includes('n')) {
            const heightDelta = Math.max(MIN_HEIGHT, Math.min(initialSize.current.height - dy, MAX_HEIGHT)) - initialSize.current.height;
            newHeight = initialSize.current.height + heightDelta;
            newY = initialResizePos.current.y - heightDelta;
        }

        // Maintain aspect ratio for corner resizes
        if (resizeDirection?.length === 2) {
            const aspectRatio = 16 / 9;
            newHeight = newWidth / aspectRatio;
            if (newHeight < MIN_HEIGHT) {
                newHeight = MIN_HEIGHT;
                newWidth = newHeight * aspectRatio;
            }
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: newX, y: newY });
    }, [isResizing, resizeDirection]);

    const handleResizeEnd = useCallback(() => {
        setIsResizing(false);
        setResizeDirection(null);
    }, []);

    // Global event listeners for drag and resize
    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
            window.addEventListener('touchmove', handleDragMove, { passive: false });
            window.addEventListener('touchend', handleDragEnd);
            return () => {
                window.removeEventListener('mousemove', handleDragMove);
                window.removeEventListener('mouseup', handleDragEnd);
                window.removeEventListener('touchmove', handleDragMove);
                window.removeEventListener('touchend', handleDragEnd);
            };
        }
    }, [isDragging, handleDragMove, handleDragEnd]);

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', handleResizeMove);
            window.addEventListener('mouseup', handleResizeEnd);
            window.addEventListener('touchmove', handleResizeMove, { passive: false });
            window.addEventListener('touchend', handleResizeEnd);
            return () => {
                window.removeEventListener('mousemove', handleResizeMove);
                window.removeEventListener('mouseup', handleResizeEnd);
                window.removeEventListener('touchmove', handleResizeMove);
                window.removeEventListener('touchend', handleResizeEnd);
            };
        }
    }, [isResizing, handleResizeMove, handleResizeEnd]);

    // Toggle expanded mode
    const toggleExpand = useCallback(() => {
        if (isExpanded) {
            setSize(prevSize.current);
            setPosition(prevPosition.current);
            setIsExpanded(false);
        } else {
            prevSize.current = { ...size };
            prevPosition.current = { ...position };
            const expandedWidth = Math.min(640, window.innerWidth - 40);
            const expandedHeight = expandedWidth / (16 / 9);
            setSize({ width: expandedWidth, height: expandedHeight });
            setPosition({
                x: (window.innerWidth - expandedWidth) / 2,
                y: (window.innerHeight - expandedHeight) / 2
            });
            setIsExpanded(true);
        }
    }, [isExpanded, size, position]);

    const hasCamera = participant.videoTrack && participant.participant.isCameraEnabled;

    return createPortal(
        <div
            ref={containerRef}
            className={`pip-container ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${showControls ? 'show-controls' : ''}`}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                width: `${size.width}px`,
                height: `${size.height}px`,
            }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
        >
            {/* Video content */}
            <div className="pip-video-content">
                {hasCamera ? (
                    <TrackVideo track={participant.videoTrack} isLocal={false} />
                ) : (
                    <div className="pip-avatar-placeholder">
                        {participant.identity?.slice(0, 2).toUpperCase() || '?'}
                    </div>
                )}
            </div>

            {/* Audio (hidden) */}
            {participant.audioTrack && (
                <TrackAudio track={participant.audioTrack} volume={isMuted ? 0 : voiceVolume} />
            )}

            {/* Name label */}
            <div className="pip-name-label">{participant.identity}</div>

            {/* Controls overlay */}
            <div className={`pip-controls ${showControls ? 'visible' : ''}`}>
                <div className="pip-controls-top">
                    <button
                        className="pip-control-btn"
                        onClick={(e) => { e.stopPropagation(); setIsMuted(!isMuted); }}
                        title={isMuted ? 'Unmute' : 'Mute'}
                    >
                        {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <button
                        className="pip-control-btn"
                        onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
                        title={isExpanded ? 'Minimize' : 'Expand'}
                    >
                        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                    <button
                        className="pip-control-btn pip-close-btn"
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        title="Close PiP"
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Resize handles - all 8 directions */}
            <div className="pip-resize-handle pip-resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} onTouchStart={(e) => handleResizeStart(e, 'n')} />
            <div className="pip-resize-handle pip-resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} onTouchStart={(e) => handleResizeStart(e, 's')} />
            <div className="pip-resize-handle pip-resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} onTouchStart={(e) => handleResizeStart(e, 'e')} />
            <div className="pip-resize-handle pip-resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} onTouchStart={(e) => handleResizeStart(e, 'w')} />
            <div className="pip-resize-handle pip-resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} onTouchStart={(e) => handleResizeStart(e, 'ne')} />
            <div className="pip-resize-handle pip-resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} onTouchStart={(e) => handleResizeStart(e, 'nw')} />
            <div className="pip-resize-handle pip-resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} onTouchStart={(e) => handleResizeStart(e, 'se')} />
            <div className="pip-resize-handle pip-resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} onTouchStart={(e) => handleResizeStart(e, 'sw')} />

            {/* Resize corner indicator */}
            <div className="pip-resize-indicator">
                <svg width="12" height="12" viewBox="0 0 12 12">
                    <line x1="4" y1="12" x2="12" y2="4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                    <line x1="8" y1="12" x2="12" y2="8" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
                </svg>
            </div>
        </div>,
        document.body
    );
}
