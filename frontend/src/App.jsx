import { useMemo, useState } from 'react';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';
import ChatPanel from './ChatPanel';
import OceanSidebar from './OceanSidebar';
import './App.css';
import { useCurrentUserProfile } from './hooks/useCurrentUserProfile';

const recentChats = [
  { title: 'Moon Analyze', time: '15m ago' },
  { title: 'General Analyze', time: '1h ago' },
  { title: 'Rekt Analyze', time: '1week ago' },
];

function App() {
  const [selectedChatTitle, setSelectedChatTitle] = useState(recentChats[0].title);
  const {
    user,
    status: userStatus,
    saveUserProfile,
    signOut,
  } = useCurrentUserProfile();

  const selectedChat = useMemo(
    () => recentChats.find((chat) => chat.title === selectedChatTitle) ?? recentChats[0],
    [selectedChatTitle]
  );

  return (
    <div className="app-container">
      <AppHeader
        user={user}
        userStatus={userStatus}
        onSaveProfile={saveUserProfile}
        onSignOut={signOut}
      />

      <div className="content-shell">
        <div className="content-layout">
          <OceanSidebar
            chats={recentChats}
            selectedChatTitle={selectedChat.title}
            onSelectChat={setSelectedChatTitle}
          />
          <ChatPanel title={selectedChat.title} />
        </div>
      </div>

      <AppFooter />
    </div>
  );
}

export default App;
