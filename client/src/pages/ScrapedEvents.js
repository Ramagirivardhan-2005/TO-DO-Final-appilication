import axios from "axios";
import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const PLATFORM_CONFIG = {
  All: { emoji: '🌐', color: '#6c5ce7', gradient: 'linear-gradient(135deg, #6c5ce7, #a29bfe)' },
  Codeforces: { emoji: '⚔️', color: '#1389FD', gradient: 'linear-gradient(135deg, #1389FD, #43A5FF)' },
  LeetCode: { emoji: '🧩', color: '#FFA116', gradient: 'linear-gradient(135deg, #FFA116, #FFB84D)' },
  CodeChef: { emoji: '👨‍🍳', color: '#5B4638', gradient: 'linear-gradient(135deg, #5B4638, #8B7355)' },
  Hackathons: { emoji: '🚀', color: '#E91E63', gradient: 'linear-gradient(135deg, #E91E63, #FF5252)' },
  Email: { emoji: '📧', color: '#4285F4', gradient: 'linear-gradient(135deg, #4285F4, #34A853)' },
  Instagram: { emoji: '📸', color: '#E1306C', gradient: 'linear-gradient(135deg, #E1306C, #F77737)' },
};

const STATUS_BADGES = {
  Upcoming: { bg: '#e8f5e9', color: '#2e7d32', icon: '⏰' },
  Active: { bg: '#fff3e0', color: '#e65100', icon: '🔥' },
  Finished: { bg: '#f3e5f5', color: '#7b1fa2', icon: '✅' },
  Browse: { bg: '#e3f2fd', color: '#1565c0', icon: '🔗' },
};

export default function ScrapedEvents({ user }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('All');
  const [importingId, setImportingId] = useState(null);
  const [importedIds, setImportedIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [emailConfig, setEmailConfig] = useState({ email: '', app_password: '', instagramHandles: [] });
  const [hasEmailConfig, setHasEmailConfig] = useState(false);
  const [igInput, setIgInput] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const navigate = useNavigate();

  // Check email config on mount
  useEffect(() => {
    const checkConfig = async () => {
      try {
        const res = await axios.get(`http://localhost:5000/api/email/config/${user.id}`);
        if (res.data.hasConfig) {
          setHasEmailConfig(true);
          setEmailConfig(prev => ({
            ...prev,
            email: res.data.email || '',
            instagramHandles: res.data.instagramHandles || []
          }));
        }
      } catch (e) { /* no config yet */ }
    };
    checkConfig();
  }, [user.id]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `http://localhost:5000/api/scrape/all?userId=${user.id}`;
      if (activeFilter === 'Codeforces') url = 'http://localhost:5000/api/scrape/codeforces';
      if (activeFilter === 'LeetCode') url = 'http://localhost:5000/api/scrape/leetcode';
      if (activeFilter === 'CodeChef') url = 'http://localhost:5000/api/scrape/codechef';
      if (activeFilter === 'Hackathons') url = 'http://localhost:5000/api/scrape/hackathons';
      if (activeFilter === 'Email') url = `http://localhost:5000/api/email/scan/${user.id}`;
      if (activeFilter === 'Instagram') url = `http://localhost:5000/api/scrape/instagram-all/${user.id}`;

      const res = await axios.get(url);
      setEvents(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      const msg = err.response?.data?.error || 'Failed to fetch events. Make sure the server is running.';
      setError(msg);
      setEvents([]);
    }
    setLoading(false);
  }, [activeFilter, user.id]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  const importAsTask = async (event) => {
    setImportingId(event.id);
    try {
      await axios.post('http://localhost:5000/api/import-task', {
        user_id: user.id,
        name: event.name,
        startTime: event.startTime,
        platform: event.platform,
        url: event.url
      });
      setImportedIds(prev => new Set([...prev, event.id]));
    } catch (err) { console.error(err); }
    setImportingId(null);
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsMsg('');
    try {
      await axios.post('http://localhost:5000/api/email/config', {
        user_id: user.id,
        email: emailConfig.email,
        app_password: emailConfig.app_password,
        instagram_handles: emailConfig.instagramHandles
      });
      setHasEmailConfig(true);
      setSettingsMsg('✅ Settings saved! Switch to Email or Instagram tab to see results.');
      setTimeout(() => setSettingsMsg(''), 4000);
    } catch (err) {
      setSettingsMsg('❌ Failed to save settings.');
    }
    setSettingsLoading(false);
  };

  const addIgHandle = () => {
    const handle = igInput.trim().replace('@', '');
    if (handle && !emailConfig.instagramHandles.includes(handle)) {
      setEmailConfig(prev => ({
        ...prev,
        instagramHandles: [...prev.instagramHandles, handle]
      }));
      setIgInput('');
    }
  };

  const removeIgHandle = (handle) => {
    setEmailConfig(prev => ({
      ...prev,
      instagramHandles: prev.instagramHandles.filter(h => h !== handle)
    }));
  };

  const filteredEvents = events.filter(e =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getTimeUntil = (dateStr) => {
    const diff = new Date(dateStr) - new Date();
    if (diff < 0) return 'Started';
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  };

  return (
    <div className="scrape-page">
      {/* Background */}
      <div className="bg-orb orb-1"></div>
      <div className="bg-orb orb-2"></div>
      <div className="bg-orb orb-3"></div>

      {/* Header */}
      <div className="scrape-header">
        <div className="scrape-header-left">
          <button className="back-btn" onClick={() => navigate('/dashboard')}>← Back</button>
          <div className="scrape-title-group">
            <h1 className="scrape-title">
              <span className="scrape-icon">🔍</span>
              Contest Scraper
            </h1>
            <p className="scrape-subtitle">
              Coding contests, emails, Instagram & hackathons — all in one place
            </p>
          </div>
        </div>
        <div className="header-actions-row">
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)}>
            ⚙️ Settings
          </button>
          <button className="refresh-scrape-btn" onClick={fetchEvents} disabled={loading}>
            {loading ? '⏳' : '🔄'} Refresh
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-panel-inner">
            <div className="settings-header">
              <h2>⚙️ Connect Your Accounts</h2>
              <button className="settings-close" onClick={() => setShowSettings(false)}>✕</button>
            </div>

            {/* Gmail Section */}
            <div className="settings-section">
              <div className="settings-section-title">
                <span className="settings-section-icon">📧</span>
                <div>
                  <h3>Gmail Integration</h3>
                  <p>Scans your inbox for quizzes, assignments, guest lectures, hackathons & more</p>
                </div>
              </div>
              <div className="settings-form-group">
                <label>Gmail Address</label>
                <input
                  type="email"
                  placeholder="your.email@gmail.com"
                  value={emailConfig.email}
                  onChange={e => setEmailConfig(prev => ({ ...prev, email: e.target.value }))}
                  className="settings-input"
                />
              </div>
              <div className="settings-form-group">
                <label>Gmail App Password</label>
                <input
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={emailConfig.app_password}
                  onChange={e => setEmailConfig(prev => ({ ...prev, app_password: e.target.value }))}
                  className="settings-input"
                />
                <span className="settings-hint">
                  💡 Go to <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Google App Passwords</a> → Generate one for "Mail"
                </span>
              </div>
            </div>

            {/* Instagram Section */}
            <div className="settings-section">
              <div className="settings-section-title">
                <span className="settings-section-icon">📸</span>
                <div>
                  <h3>Instagram Handles</h3>
                  <p>Add club/college Instagram profiles to monitor for events</p>
                </div>
              </div>
              <div className="ig-input-row">
                <input
                  type="text"
                  placeholder="@college_club_handle"
                  value={igInput}
                  onChange={e => setIgInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addIgHandle()}
                  className="settings-input ig-input"
                />
                <button className="ig-add-btn" onClick={addIgHandle}>+ Add</button>
              </div>
              <div className="ig-handles-list">
                {emailConfig.instagramHandles.map(h => (
                  <span key={h} className="ig-handle-tag">
                    @{h}
                    <button onClick={() => removeIgHandle(h)}>✕</button>
                  </span>
                ))}
                {emailConfig.instagramHandles.length === 0 && (
                  <span className="ig-empty-hint">No handles added yet. Add your college club handles above.</span>
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="settings-save-row">
              <button className="settings-save-btn" onClick={saveSettings} disabled={settingsLoading}>
                {settingsLoading ? '⏳ Saving...' : '💾 Save Settings'}
              </button>
              {settingsMsg && <span className="settings-msg">{settingsMsg}</span>}
            </div>

            {/* Email Config Status */}
            {hasEmailConfig && (
              <div className="settings-status">
                <span className="status-dot connected"></span>
                Gmail connected: {emailConfig.email}
                {emailConfig.instagramHandles.length > 0 && (
                  <> • {emailConfig.instagramHandles.length} Instagram handle(s)</>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="scrape-search-bar">
        <span className="search-icon">🔎</span>
        <input
          type="text"
          placeholder="Search contests, emails, hackathons..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="scrape-search-input"
        />
        {searchQuery && (
          <button className="search-clear" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      {/* Platform Filters */}
      <div className="platform-filters">
        {Object.entries(PLATFORM_CONFIG).map(([name, config]) => (
          <button
            key={name}
            className={`platform-chip ${activeFilter === name ? 'active' : ''}`}
            onClick={() => setActiveFilter(name)}
            style={{ '--chip-color': config.color, '--chip-gradient': config.gradient }}
          >
            <span className="chip-emoji">{config.emoji}</span>
            {name}
            {activeFilter === name && <span className="chip-active-dot"></span>}
          </button>
        ))}
      </div>

      {/* Setup Banner for Email/Instagram */}
      {(activeFilter === 'Email' || activeFilter === 'Instagram') && !hasEmailConfig && (
        <div className="setup-banner">
          <span className="setup-banner-icon">{activeFilter === 'Email' ? '📧' : '📸'}</span>
          <div>
            <strong>Setup Required</strong>
            <p>Click the ⚙️ Settings button above to connect your {activeFilter === 'Email' ? 'Gmail account' : 'Instagram handles'}.</p>
          </div>
          <button onClick={() => setShowSettings(true)}>Open Settings</button>
        </div>
      )}

      {/* Stats Bar */}
      <div className="scrape-stats">
        <div className="stat-pill">
          <span className="stat-number">{filteredEvents.length}</span>
          <span className="stat-label">Events Found</span>
        </div>
        <div className="stat-pill upcoming">
          <span className="stat-number">{filteredEvents.filter(e => e.status === 'Upcoming').length}</span>
          <span className="stat-label">Upcoming</span>
        </div>
        <div className="stat-pill active">
          <span className="stat-number">{filteredEvents.filter(e => e.status === 'Active').length}</span>
          <span className="stat-label">Live Now</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="scrape-error">
          <span>⚠️</span> {error}
          <button onClick={fetchEvents}>Retry</button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="scrape-loading">
          <div className="loading-spinner"></div>
          <p>Scraping live data from platforms...</p>
          <div className="loading-platforms">
            {['⚔️ Codeforces', '🧩 LeetCode', '📧 Email', '📸 Instagram', '🚀 Hackathons'].map((p, i) => (
              <span key={i} className="loading-platform-tag" style={{ animationDelay: `${i * 0.15}s` }}>
                {p}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Events Grid */}
      {!loading && (
        <div className="events-grid">
          {filteredEvents.map((event, index) => {
            const platConfig = PLATFORM_CONFIG[event.platform] || PLATFORM_CONFIG.All;
            const statusConfig = STATUS_BADGES[event.status] || STATUS_BADGES.Browse;
            const isImported = importedIds.has(event.id);
            const isImporting = importingId === event.id;

            return (
              <div
                key={event.id}
                className={`event-card ${event.status === 'Active' ? 'event-live' : ''}`}
                style={{ '--card-accent': platConfig.color, animationDelay: `${index * 0.05}s` }}
              >
                {/* Platform Badge */}
                <div className="event-platform-strip" style={{ background: platConfig.gradient }}>
                  <span className="event-platform-emoji">{platConfig.emoji}</span>
                  <span className="event-platform-name">{event.platform}</span>
                  {event.status === 'Active' && <span className="live-dot"></span>}
                </div>

                {/* Content */}
                <div className="event-content">
                  <h3 className="event-name">{event.name}</h3>

                  {/* Email-specific: From and Snippet */}
                  {event.from && (
                    <div className="event-from">
                      <span className="meta-icon">👤</span>
                      <span className="from-text">{event.from}</span>
                    </div>
                  )}
                  {event.snippet && (
                    <p className="event-snippet">{event.snippet}...</p>
                  )}

                  <div className="event-meta">
                    <div className="event-meta-row">
                      <span className="meta-icon">📅</span>
                      <span>{new Date(event.startTime).toLocaleDateString('en-US', {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
                      })}</span>
                    </div>
                    <div className="event-meta-row">
                      <span className="meta-icon">🕐</span>
                      <span>{new Date(event.startTime).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit'
                      })}</span>
                    </div>
                    {event.duration !== 'From email' && event.duration !== 'Profile' && event.duration !== 'Visit Profile' && event.duration !== 'Check profile' && event.duration !== 'Setup Required' && (
                      <div className="event-meta-row">
                        <span className="meta-icon">⏱️</span>
                        <span>{event.duration}</span>
                      </div>
                    )}
                  </div>

                  {/* Tags Row */}
                  <div className="event-tags-row">
                    <span className="event-status-badge"
                      style={{ background: statusConfig.bg, color: statusConfig.color }}>
                      {statusConfig.icon} {event.status}
                    </span>
                    {event.status === 'Upcoming' && (
                      <span className="event-countdown">🕑 {getTimeUntil(event.startTime)}</span>
                    )}
                    {event.type && (
                      <span className="event-type-badge">{event.type}</span>
                    )}
                    {event.difficulty && (
                      <span className={`difficulty-badge diff-${event.difficulty.toLowerCase()}`}>
                        {event.difficulty}
                      </span>
                    )}
                  </div>

                  {/* Keywords (from email) */}
                  {event.keywords && event.keywords.length > 0 && (
                    <div className="event-topic-tags">
                      {event.keywords.map((tag, i) => (
                        <span key={i} className="topic-tag">{tag}</span>
                      ))}
                    </div>
                  )}

                  {/* LeetCode tags */}
                  {event.tags && event.tags.length > 0 && (
                    <div className="event-topic-tags">
                      {event.tags.slice(0, 4).map((tag, i) => (
                        <span key={i} className="topic-tag">{tag}</span>
                      ))}
                      {event.tags.length > 4 && (
                        <span className="topic-tag more">+{event.tags.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="event-actions">
                  <a href={event.url} target="_blank" rel="noopener noreferrer"
                    className="event-btn event-btn-view">
                    🔗 Open
                  </a>
                  <button
                    className={`event-btn event-btn-import ${isImported ? 'imported' : ''}`}
                    onClick={() => importAsTask(event)}
                    disabled={isImported || isImporting}>
                    {isImporting ? '⏳' : isImported ? '✅ Added' : '📥 Add to Tasks'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredEvents.length === 0 && !error && (
        <div className="scrape-empty">
          <div className="empty-icon">🏖️</div>
          <h3>No events found</h3>
          <p>
            {activeFilter === 'Email' ? 'Connect your Gmail in Settings to scan for academic events.' :
             activeFilter === 'Instagram' ? 'Add Instagram handles in Settings to monitor club pages.' :
             'No contests match your filters. Try a different platform or clear the search.'}
          </p>
          {(activeFilter === 'Email' || activeFilter === 'Instagram') && (
            <button className="empty-settings-btn" onClick={() => setShowSettings(true)}>
              ⚙️ Open Settings
            </button>
          )}
        </div>
      )}
    </div>
  );
}
