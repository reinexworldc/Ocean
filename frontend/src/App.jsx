import { useMemo, useState } from 'react';
import AppFooter from './AppFooter';
import AppHeader from './AppHeader';
import ChatPanel from './ChatPanel';
import OceanSidebar from './OceanSidebar';
import './App.css';
import { useCurrentUserProfile } from './hooks/useCurrentUserProfile';
import { useWalletSession } from './hooks/useWalletSession';

const recentChats = [
  { title: 'Moon Analyze', time: '15m ago' },
  { title: 'General Analyze', time: '1h ago' },
  { title: 'Rekt Analyze', time: '1week ago' },
];

function App() {
  const [selectedChatTitle, setSelectedChatTitle] = useState(recentChats[0].title);
  const walletSession = useWalletSession();
  const {
    user,
    status: userStatus,
    saveUserProfile,
  } = useCurrentUserProfile({
    enabled: walletSession.isAuthenticated,
    userId: walletSession.user?.id ?? null,
  });

  const currentUser = useMemo(() => {
    if (!walletSession.user && !user) {
      return null;
    }

    return {
      ...(walletSession.user ?? {}),
      ...(user ?? {}),
    };
  }, [user, walletSession.user]);

  const selectedChat = useMemo(
    () => recentChats.find((chat) => chat.title === selectedChatTitle) ?? recentChats[0],
    [selectedChatTitle]
  );

  return (
    <div className="app-container">
      <AppHeader
        user={currentUser}
        userStatus={userStatus}
        onSaveProfile={saveUserProfile}
        onSignOut={walletSession.signOut}
        onConnectWallet={walletSession.connectWallet}
        onRetryAuthentication={walletSession.retryAuthentication}
        isAuthenticated={walletSession.isAuthenticated}
        walletAddress={walletSession.walletAddress}
        walletState={walletSession.walletState}
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
