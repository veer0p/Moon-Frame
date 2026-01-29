import { useState } from 'react';
import LandingScreen from './components/LandingScreen';
import WatchRoom from './components/WatchRoom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import { AuthProvider, useAuth } from './context/AuthContext';
import './index.css';

function AppContent() {
  const { user, loading } = useAuth();
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [screen, setScreen] = useState('landing'); // 'landing' | 'watch'
  const [roomId, setRoomId] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [username, setUsername] = useState('');

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  if (!user) {
    return authMode === 'login' ? (
      <Login onToggleMode={() => setAuthMode('signup')} />
    ) : (
      <Signup onToggleMode={() => setAuthMode('login')} />
    );
  }

  const handleCreateRoom = (file, user) => {
    setRoomId(null); // Will be created in WatchRoom
    setVideoFile(file);
    setUsername(user);
    setScreen('watch');
  };

  const handleJoinRoom = (id, file, user) => {
    setRoomId(id);
    setVideoFile(file);
    setUsername(user);
    setScreen('watch');
  };

  const handleLeaveRoom = () => {
    setScreen('landing');
    setRoomId(null);
    setVideoFile(null);
    setUsername('');
  };

  return (
    <>
      {screen === 'landing' && (
        <LandingScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
        />
      )}
      {screen === 'watch' && (
        <WatchRoom
          roomId={roomId}
          videoFile={videoFile}
          username={username}
          onLeave={handleLeaveRoom}
        />
      )}
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

