import { useState } from 'react';
import LandingScreen from './components/LandingScreen';
import WatchRoom from './components/WatchRoom';
import './index.css';

function App() {
  const [screen, setScreen] = useState('landing'); // 'landing' | 'watch'
  const [roomId, setRoomId] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [username, setUsername] = useState('');

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

export default App;

