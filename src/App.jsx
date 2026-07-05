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
  const [screen, setScreen] = useState(() => sessionStorage.getItem('screen') || 'landing'); // 'landing' | 'watch'
  const [roomId, setRoomId] = useState(() => sessionStorage.getItem('roomId') || null);
  const [videoFile, setVideoFile] = useState(null);
  const [username, setUsername] = useState(() => sessionStorage.getItem('username') || '');
  const [isGuest, setIsGuest] = useState(false);

  if (loading) {
    return <div className="loading-screen">Loading...</div>;
  }

  const showLanding = user || isGuest || screen === 'watch';

  if (!showLanding) {
    return authMode === 'login' ? (
      <Login 
        onToggleMode={() => setAuthMode('signup')} 
        onContinueAsGuest={() => setIsGuest(true)}
      />
    ) : (
      <Signup 
        onToggleMode={() => setAuthMode('login')} 
        onContinueAsGuest={() => setIsGuest(true)}
      />
    );
  }

  const handleCreateRoom = (file, userStr) => {
    setRoomId(null); // Will be created in WatchRoom
    setVideoFile(file);
    setUsername(userStr);
    setScreen('watch');
    sessionStorage.setItem('username', userStr);
    sessionStorage.setItem('screen', 'watch');
    sessionStorage.removeItem('roomId');
  };

  const handleJoinRoom = (id, file, userStr) => {
    setRoomId(id);
    setVideoFile(file);
    setUsername(userStr);
    setScreen('watch');
    sessionStorage.setItem('roomId', id);
    sessionStorage.setItem('username', userStr);
    sessionStorage.setItem('screen', 'watch');
  };

  const handleLeaveRoom = () => {
    setScreen('landing');
    setRoomId(null);
    setVideoFile(null);
    setUsername('');
    sessionStorage.removeItem('roomId');
    sessionStorage.removeItem('username');
    sessionStorage.setItem('screen', 'landing');
  };

  return (
    <>
      {screen === 'landing' && (
        <LandingScreen
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          isGuest={isGuest}
          onExitGuest={() => setIsGuest(false)}
        />
      )}
      {screen === 'watch' && (
        <WatchRoom
          roomId={roomId}
          videoFile={videoFile}
          onVideoFileSelect={setVideoFile}
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

