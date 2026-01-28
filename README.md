# Watch Together - Desktop App

A desktop application for watching videos together in real-time with friends. Built with Electron, React, and Supabase.

## Features

- 🎬 **Real-time Video Synchronization**: Watch videos in perfect sync with friends
- 💬 **Live Chat**: Chat while watching together
- 👥 **User Presence**: See who's watching with you
- 🔔 **Notifications**: Get notified of important events
- ⌨️ **Keyboard Shortcuts**: Control playback with keyboard
- 🎨 **Modern UI**: Beautiful, responsive interface
- 🖥️ **Desktop Native**: Native file dialogs and window management
- 📹 **Multiple Formats**: Support for MP4, WebM, MOV, AVI, MKV, FLV, WMV, M4V, MPG, MPEG, 3GP, TS, M2TS

## Installation

1. Navigate to the project directory:
```bash
cd /home/veer/Documents/Projects/electron-watch-together
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Development Mode

Start the app in development mode:
```bash
npm run dev
```

This will:
1. Start the Vite dev server
2. Launch the Electron app
3. Enable hot-reload for React components

### Production Build

Build the app for production:
```bash
npm run build
npm run electron
```

## How It Works

### Creating a Room
1. Click "Create Room"
2. Select a video file from your computer
3. Share the room code with friends

### Joining a Room
1. Get the room code from your friend
2. Click "Join Room" and enter the code
3. Select the same video file
4. Start watching together!

### Default Room
- Quick join the default room (WATCH1) without needing a code
- Perfect for regular watch sessions with the same group

## Features in Detail

### Real-time Synchronization
- Play/pause events sync across all participants
- Seek events keep everyone at the same timestamp
- Automatic sync recovery if someone falls behind

### Chat System
- Real-time messaging
- See who sent each message
- Persistent chat history during the session

### Presence System
- See all active users in the room
- Real-time join/leave notifications
- User activity tracking

### Keyboard Shortcuts
- **Space**: Play/Pause
- **Arrow Left/Right**: Seek backward/forward
- **F**: Fullscreen
- **M**: Mute/Unmute
- **Arrow Up/Down**: Volume control

## Technology Stack

- **Electron**: Desktop app framework
- **React**: UI framework
- **Vite**: Build tool and dev server
- **Supabase**: Real-time database and broadcast
- **Zustand**: State management

## Project Structure

```
electron-watch-together/
├── electron/
│   ├── main.js          # Electron main process
│   └── preload.js       # Secure IPC bridge
├── src/
│   ├── components/      # React components
│   ├── hooks/           # Custom React hooks
│   ├── lib/             # Supabase client
│   ├── utils/           # Utility functions
│   ├── App.jsx          # Main app component
│   └── main.jsx         # React entry point
├── package.json
└── vite.config.js
```

## Configuration

The app uses Supabase for real-time features. Configuration is stored in `.env`:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## License

MIT
