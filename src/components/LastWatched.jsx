import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import formatTime from '../utils/formatTime';
import './LastWatched.css';

function LastWatched({ lastWatched, onJoinRoom }) {
    const { user } = useAuth();

    if (!lastWatched || lastWatched.length === 0) return null;

    return (
        <div className="last-watched-section">
            <div className="section-header">
                <h3 className="section-title">Continue Watching</h3>
                <div className="section-line"></div>
            </div>
            <div className="last-watched-grid">
                {lastWatched.map((item) => (
                    <div
                        key={item.id}
                        className="last-watched-card glass"
                        onClick={() => {
                            console.log('LastWatched: Joining room with item:', item);
                            let videoFile = null;
                            if (item.video_path) {
                                videoFile = {
                                    name: item.video_name || 'Last Video',
                                    type: 'video/mp4',
                                    size: 0,
                                    previewUrl: `video://${item.video_path}`
                                };
                                console.log('LastWatched: Reconstructed videoFile:', videoFile);
                            } else {
                                console.warn('LastWatched: No video_path found for this room');
                            }
                            onJoinRoom(item.room_code, videoFile, user.email.split('@')[0]);
                        }}
                    >
                        <div className="card-visual">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div className="card-info">
                            <span className="room-code">{item.room_code}</span>
                            {item.video_name && <span className="video-name">{item.video_name}</span>}
                            <span className="video-time">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                                    <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {formatTime(item.video_time)}
                            </span>
                        </div>
                        <div className="card-action-premium">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default LastWatched;
