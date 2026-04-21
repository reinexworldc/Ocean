import arrowDownIcon from '../dist/arrow-down-svgrepo-com.svg';
import coinbaseLogo from '../dist/coinbase-v2-svgrepo-com (1).svg';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <header className="header">
        <div className="logo-container">
          <span className="logo-ocean">OCEAN</span>
          <span className="logo-chat">CHAT</span>
        </div>
        <div className="header-right">
          <div className="user-controls">
            <div className="credits-badge">74 CREDITS LEFT</div>
            <div className="profile-button" aria-hidden="true">
              <img
                src="https://i.pravatar.cc/150?img=47"
                alt="Profile"
                className="profile-pic"
              />
            </div>
          </div>
          <div className="dropdown-menu">
            <div className="dropdown-header">
              <div className="greeting">HI, REINEX!</div>
              <div className="email">REINEX@ARC.COM</div>
              <button className="settings-btn">SETTINGS</button>
            </div>
            <div className="dropdown-section">
              <div className="section-title">EXTERNAL WALLET</div>
              <div className="wallet-address">
                <img
                  src={coinbaseLogo}
                  alt="Coinbase"
                  className="wallet-icon"
                />
                <span>0X123ABC...</span>
              </div>
            </div>
            <div className="dropdown-footer">
              <button className="sign-out-btn">SIGN OUT</button>
            </div>
          </div>
        </div>
      </header>

      <div className="content-shell">
        <main className="main-content">
          <div className="chat-wrapper">
            <h2 className="chat-title">Moon Analyze</h2>
            <div className="chat-container">
              <div className="chat-header-actions">
                <span className="ws-badge">
                  <span>12 W/S</span>
                  <img
                    src={arrowDownIcon}
                    alt=""
                    aria-hidden="true"
                    className="ws-badge-icon"
                  />
                </span>
              </div>
              
              <div className="message-row user-row">
                <div className="message user-message">
                  That's perfect! Give me summary for this
                </div>
              </div>
              
              <div className="message-row assistant-row">
                <div className="message assistant-message">
                  <p>Sure! Here a few options:</p>
                  <div className="options-list">
                    <div className="option-item">
                      <span className="option-number">1</span>
                      <span>This is option number 1</span>
                    </div>
                    <div className="option-item">
                      <span className="option-number">2</span>
                      <span>This is option number 2</span>
                    </div>
                    <div className="option-item">
                      <span className="option-number">3</span>
                      <span>This is option number 3</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="chat-actions">
                <button className="copy-btn" aria-label="Copy">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer">
          <div className="input-container">
            <div className="input-icon"></div>
            <input type="text" placeholder="Ask Ocean..." className="chat-input" />
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
