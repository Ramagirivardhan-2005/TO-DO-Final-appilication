import axios from "axios";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Calendar from "react-calendar";
import 'react-calendar/dist/Calendar.css'; // basic styles, we'll override in App.css

export default function Dashboard({ user, logout }) {
  const [tasks, setTasks] = useState([]);
  const [userData, setUserData] = useState({ points: 0, email: '' });
  const [alertTaskId, setAlertTaskId] = useState(null);
  const [notifiedIds, setNotifiedIds] = useState([]);
  const notifiedIdsRef = useRef(notifiedIds);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("Pending"); // "All", "Pending", "Upcoming", "Active", "Expired", "Completed"
  const [selectedDate, setSelectedDate] = useState(new Date());
  
  // MFA State
  const [showMfaModal, setShowMfaModal] = useState(false);
  const [mfaStep, setMfaStep] = useState('idle'); // 'idle', 'qr', 'verifying', 'done', 'disabling'
  const [mfaQrCode, setMfaQrCode] = useState('');
  const [mfaSecret, setMfaSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMsg, setMfaMsg] = useState({ text: '', type: '' });
  const [mfaLoading, setMfaLoading] = useState(false);
  
  const navigate = useNavigate();

  // --- Fetch Tasks and User Data ---
  const fetchTasksAndUser = useCallback(async () => {
    try {
      // Fetch Dashboard Tasks
      const resT = await axios.get(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/tasks/${user.id}`);
      setTasks(resT.data);

      // Fetch User points
      const resU = await axios.get(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/users/${user.id}`);
      setUserData(resU.data);
    } catch (err) { console.error(err); }
  }, [user.id]);

  useEffect(() => { fetchTasksAndUser(); }, [fetchTasksAndUser]);

  // --- Compute Status and Priority ---
  const computedTasks = useMemo(() => {
    const now = Date.now();
    return tasks.map(task => {
      let status = "Upcoming"; // Default
      let priority = task.priority || "Medium";
      let timeRemainingText = "";

      if (task.is_completed) {
        status = "Completed";
      } else if (!task.completion_time) {
        status = "Pending"; // No date, just pending
      } else {
        const due = new Date(task.completion_time).getTime();
        const diffMs = due - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        if (diffMs < 0) {
          status = "Expired";
          priority = "Expired";
        } else {
          // Format remaining time
          const days = Math.floor(diffHours / 24);
          const hrs = Math.floor(diffHours % 24);
          const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          
          if (days > 0) timeRemainingText = `${days}d ${hrs}h left`;
          else if (hrs > 0) timeRemainingText = `${hrs}h ${mins}m left`;
          else timeRemainingText = `${mins}m left`;

          if (diffHours < 2) {
            status = "Active"; // Due very soon
            priority = "High";
          } else if (diffHours < 24) {
            status = "Upcoming";
            priority = "Medium";
          } else {
            status = "Upcoming";
            priority = "Low";
          }
        }
      }
      return { ...task, computedStatus: status, computedPriority: priority, timeRemainingText };
    });
  }, [tasks]);

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    const s = { all: 0, pending: 0, upcoming: 0, active: 0, expired: 0, completed: 0 };
    computedTasks.forEach(t => {
      s.all++;
      if (t.computedStatus === "Pending" && !t.completion_time) s.pending++;
      if (t.computedStatus === "Upcoming") s.upcoming++;
      if (t.computedStatus === "Active") s.active++;
      if (t.computedStatus === "Expired") s.expired++;
      if (t.computedStatus === "Completed") s.completed++;
      if (t.computedStatus === "Pending" && t.completion_time && !t.is_completed && new Date(t.completion_time) > new Date()) s.pending++; // standard pending
    });
    // Adjust pending count for standard display
    s.pending = computedTasks.filter(t => !t.is_completed && t.computedStatus !== "Expired").length;
    return s;
  }, [computedTasks]);

  // --- Filtering & Searching ---
  const displayedTasks = useMemo(() => {
    let sortedAndFiltered = computedTasks.filter(t => {
      // 1. Search text
      if (searchQuery && !t.task_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      
      // 2. Tab Filter
      if (activeTab === "All") return true;
      if (activeTab === "Completed" && t.computedStatus === "Completed") return true;
      if (activeTab === "Expired" && t.computedStatus === "Expired") return true;
      if (activeTab === "Active" && t.computedStatus === "Active") return true;
      if (activeTab === "Upcoming" && t.computedStatus === "Upcoming") return true;
      if (activeTab === "Pending" && !t.is_completed && t.computedStatus !== "Expired") return true;
      
      return false;
    }).sort((a,b) => {
      if (a.is_completed) return 1;
      if (b.is_completed) return -1;
      if (!a.completion_time) return 1;
      if (!b.completion_time) return -1;
      return new Date(a.completion_time) - new Date(b.completion_time);
    });

    // 3. Deduplicate Series: Only show the "earliest" relevant instance of a series
    let seenSeries = new Set();
    return sortedAndFiltered.filter(t => {
       if (t.recurring_id) {
           if (seenSeries.has(t.recurring_id)) return false;
           seenSeries.add(t.recurring_id);
       }
       return true;
    });
  }, [computedTasks, searchQuery, activeTab]);

  // --- API Handlers ---
  const handleToggleComplete = async (task) => {
    try {
      const res = await axios.put(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/tasks/${task._id}/complete`);
      if (res.data.pointsAwarded) {
        // Simple visual feedback could go here
        alert(`+${res.data.pointsAwarded} Coins Earned!`);
      }
      fetchTasksAndUser(); // refresh state
    } catch(err) {
      console.error("Failed to update status", err);
    }
  };

  const handleCalendarClick = (date) => {
    // Format YYYY-MM-DD
    const offset = date.getTimezoneOffset()
    const d = new Date(date.getTime() - (offset*60*1000))
    const dateStr = d.toISOString().split('T')[0]
    navigate(`/add?date=${dateStr}`);
  };

  // Keep ref in sync with state
  useEffect(() => {
    notifiedIdsRef.current = notifiedIds;
  }, [notifiedIds]);

  // --- AI Alerts (Same as before but considering early reminders) ---
  useEffect(() => {
    if (Notification.permission !== "granted") {
        Notification.requestPermission();
    }
    const scanner = setInterval(() => {
        const now = new Date();
        computedTasks.forEach(task => {
            if(!task.completion_time || task.is_completed) return;
            const due = new Date(task.completion_time);
            
            // Check exact minute
            const isTimeMatch = due.getHours() === now.getHours() && due.getMinutes() === now.getMinutes() && due.getDate() === now.getDate();
            
            // Check early reminder logic
            let isReminderMatch = false;
            const diffMs = due.getTime() - now.getTime();
            const diffMins = Math.floor(diffMs / 60000);
            
            if (task.reminder && Array.isArray(task.reminder)) {
                if (task.reminder.includes('5m') && diffMins === 5) isReminderMatch = true;
                if (task.reminder.includes('10m') && diffMins === 10) isReminderMatch = true;
                if (task.reminder.includes('15m') && diffMins === 15) isReminderMatch = true;
                if (task.reminder.includes('20m') && diffMins === 20) isReminderMatch = true;
                if (task.reminder.includes('30m') && diffMins === 30) isReminderMatch = true;
                if (task.reminder.includes('45m') && diffMins === 45) isReminderMatch = true;
                if (task.reminder.includes('1h') && diffMins === 60) isReminderMatch = true;
                if (task.reminder.includes('1d') && diffMins === (24*60)) isReminderMatch = true;
            }

            if ((isTimeMatch || isReminderMatch) && !notifiedIdsRef.current.includes(task._id)) {
                triggerAIAlert(task, isReminderMatch);
            }
        });
    }, 5000);
    return () => clearInterval(scanner);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedTasks]);

  const triggerAIAlert = (task, isReminder) => {
    const title = isReminder ? `Reminder: Event due soon!` : `🚨 TASK DUE NOW!`;
    const message = `"${task.task_name}" is due ${isReminder ? 'soon' : 'right now'}.`;
    new Notification(title, { body: message, icon: "https://cdn-icons-png.flaticon.com/512/564/564619.png" });
    setAlertTaskId(task._id);
    document.body.classList.add('critical-mode');
    setNotifiedIds(prev => [...prev, task._id]);
    setTimeout(() => {
        document.body.classList.remove('critical-mode');
        setAlertTaskId(null);
    }, 10000);
  };

  const handleEditTask = (task) => {
    let path = `/edit/${task._id}`;
    if (task.recurring_id) {
       const confirmSeries = window.confirm("This is a recurring event.\n\nClick 'OK' to edit the ENTIRE series.\nClick 'Cancel' to edit ONLY this event.");
       if (confirmSeries) {
           path += `?series=true`;
       }
    }
    navigate(path);
  };

  const handleDelete = async (task) => {
    let url = `${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/tasks/${task._id}`;
    if (task.recurring_id) {
       const confirmSeries = window.confirm("This is a recurring event.\n\nClick 'OK' to delete the ENTIRE series.\nClick 'Cancel' to delete ONLY this event.");
       if (confirmSeries) {
           url += `?series=true`;
       }
    } else {
       const confirmDel = window.confirm("Are you sure you want to delete this event?");
       if (!confirmDel) return;
    }
    
    try {
      await axios.delete(url);
      fetchTasksAndUser();
    } catch(err) { console.error(err); }
  };

  // Helper for Calendar Highlights
  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dStr = date.toDateString();
      const hasTask = computedTasks.some(t => t.completion_time && new Date(t.completion_time).toDateString() === dStr);
      const hasActive = computedTasks.some(t => t.completion_time && new Date(t.completion_time).toDateString() === dStr && !t.is_completed);
      if (hasActive) return 'react-calendar__tile--hasActiveTask';
      if (hasTask) return 'react-calendar__tile--hasTask';
    }
    return null;
  };

  // --- MFA Handlers ---
  const handleMfaSetup = async () => {
    setMfaLoading(true);
    setMfaMsg({ text: '', type: '' });
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/api/mfa/setup`, { userId: user.id });
      setMfaQrCode(res.data.qrCode);
      setMfaSecret(res.data.secret);
      setMfaStep('qr');
    } catch (err) {
      setMfaMsg({ text: err.response?.data?.error || 'Failed to initiate MFA setup', type: 'error' });
    }
    setMfaLoading(false);
  };

  const handleMfaVerifySetup = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    setMfaMsg({ text: '', type: '' });
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/api/mfa/verify-setup`, {
        userId: user.id,
        token: mfaCode
      });
      if (res.data.success) {
        setMfaStep('done');
        setMfaMsg({ text: '✅ MFA enabled successfully! Your account is now secured.', type: 'success' });
        setUserData(prev => ({ ...prev, mfaEnabled: true }));
        setMfaCode('');
      }
    } catch (err) {
      setMfaMsg({ text: err.response?.data?.error || 'Invalid code. Try again.', type: 'error' });
    }
    setMfaLoading(false);
  };

  const handleMfaDisable = async () => {
    if (mfaCode.length !== 6) return;
    setMfaLoading(true);
    setMfaMsg({ text: '', type: '' });
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-2.onrender.com"}/api/mfa/disable`, {
        userId: user.id,
        token: mfaCode
      });
      if (res.data.success) {
        setMfaStep('done');
        setMfaMsg({ text: '🔓 MFA disabled successfully.', type: 'success' });
        setUserData(prev => ({ ...prev, mfaEnabled: false }));
        setMfaCode('');
      }
    } catch (err) {
      setMfaMsg({ text: err.response?.data?.error || 'Invalid code. Cannot disable.', type: 'error' });
    }
    setMfaLoading(false);
  };

  const openMfaModal = () => {
    setShowMfaModal(true);
    setMfaStep('idle');
    setMfaCode('');
    setMfaMsg({ text: '', type: '' });
    setMfaQrCode('');
    setMfaSecret('');
  };

  return (
    <div className="dashboard gamified">
      {/* HEADER */}
      <div className="header">
        <div className="app-logo" style={{display:'flex', alignItems:'center', gap:'10px'}}>
           <span style={{fontSize:'24px'}}>⚡</span> 
           <div>
             <h2 style={{margin:0, fontSize:'1.2rem'}}>{user.username}'s HQ</h2>
           </div>
        </div>
        
        <div className="top-actions">
           <div className="points-counter" title="Complete tasks on time to earn coins!">
             🪙 {userData.points}
           </div>
           <button className="btn-scrape" onClick={() => navigate("/store")} title="Buy Coins">
              🛒 Store
            </button>
            <button className="btn-scrape" onClick={() => navigate("/wallet")} title="Wallet & Marketplace">
              💎 Wallet
            </button>
           <button className="btn-scrape" onClick={() => navigate("/events")} title="Contest Scraper">
             🔍 Contests
           </button>
           <button className="btn-circle add" onClick={() => navigate("/add")} title="Add New Event">+</button>
            <button className="btn-refresh" onClick={openMfaModal} title="Security Settings" style={{fontSize: '16px'}}>🔐</button>
           <button className="btn-refresh" onClick={fetchTasksAndUser} title="Refresh">⟳</button>
           <button className="btn-refresh" style={{color:'#ff7675'}} onClick={logout} title="Logout">⏻</button>
        </div>
      </div>

      <div className="dashboard-grid">
        {/* MAIN COLUMN (Tasks, Search, Tabs) */}
        <div className="main-col">
          {/* STATS */}
          <div className="stats-row">
            <div className="stat-card" onClick={() => setActiveTab("Pending")}>
              <div className="stat-num">{stats.pending}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card active" onClick={() => setActiveTab("Active")}>
              <div className="stat-num">{stats.active}</div>
              <div className="stat-label">Live/Active</div>
            </div>
            <div className="stat-card upcoming" onClick={() => setActiveTab("Upcoming")}>
              <div className="stat-num">{stats.upcoming}</div>
              <div className="stat-label">Upcoming</div>
            </div>
            <div className="stat-card completed" onClick={() => setActiveTab("Completed")}>
              <div className="stat-num">{stats.completed}</div>
              <div className="stat-label">Completed</div>
            </div>
            <div className="stat-card expired" onClick={() => setActiveTab("Expired")}>
              <div className="stat-num">{stats.expired}</div>
              <div className="stat-label">Expired</div>
            </div>
          </div>

          {/* CONTROLS (Search & Tabs) */}
          <div className="controls-row">
            <input 
              type="text" 
              className="task-search" 
              placeholder="Search events, tasks..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <div className="filter-tabs">
              {["All", "Pending", "Active", "Upcoming", "Completed", "Expired"].map(tab => (
                <button 
                  key={tab} 
                  className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>

          {/* TASK LIST */}
          <div className="task-list">
            {displayedTasks.length === 0 ? (
              <div style={{ textAlign:'center', marginTop: '40px', color: '#666' }}>
                <div style={{fontSize:'3rem'}}>🎉</div>
                <p>No {activeTab.toLowerCase()} tasks found.</p>
              </div>
            ) : (
              displayedTasks.map(task => (
                <div 
                  key={task._id} 
                  className={`task-card-hero ${task.is_completed ? 'completed' : task.computedPriority.toLowerCase()} ${task._id === alertTaskId ? 'AI-GLOW' : ''}`}
                >
                  {/* Left Column: Complete Toggle */}
                  <div className="task-toggle" onClick={() => handleToggleComplete(task)}>
                    <div className={`checkbox ${task.is_completed ? 'checked' : ''}`}>
                      {task.is_completed && '✓'}
                    </div>
                  </div>

                  {/* Middle Column: Info */}
                  <div className="task-info-hero">
                    <div style={{display:'flex', gap:'10px', alignItems:'center'}}>
                      <span className={`status-badge ${task.computedStatus.toLowerCase()}`}>{task.computedStatus}</span>
                      {task.timeRemainingText && !task.is_completed && (
                        <span className="time-remaining">⏳ {task.timeRemainingText}</span>
                      )}
                    </div>
                    <h3>{task.task_name}</h3>
                    {task.description && <p className="task-desc">{task.description}</p>}
                    
                    <div className="task-meta-row">
                      {task.completion_time && (
                        <span className="meta-item">📅 {new Date(task.completion_time).toLocaleString([], {weekday:'short', month:'short', day:'numeric', hour: '2-digit', minute:'2-digit'})}</span>
                      )}
                      {task.reminder && task.reminder.length > 0 && <span className="meta-item">🔔 {task.reminder.join(', ')}</span>}
                      {task.recurrence && task.recurrence !== 'None' && <span className="meta-item">🔁 Repeat: {task.recurrence}</span>}
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="task-actions-stack">
                    {task.source_url && (
                        <button className="btn-edit-sm" style={{background: 'linear-gradient(45deg, #FF6B6B, #FDCB6E)'}} title="Open Link" onClick={() => window.open(task.source_url, '_blank')}>🔗</button>
                    )}
                    <button className="btn-edit-sm" title="Edit" onClick={() => handleEditTask(task)}>✏️</button>
                    <button className="btn-delete-sm" title="Delete" onClick={() => handleDelete(task)}>🗑️</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* SIDEBAR (Calendar) */}
        <div className="sidebar-col">
          <div className="calendar-card">
            <h3>Event Calendar</h3>
            <p className="calendar-hint">Click a date to add an event</p>
            <Calendar 
              onChange={setSelectedDate} 
              value={selectedDate} 
              onClickDay={handleCalendarClick}
              tileClassName={tileClassName}
              className="dark-calendar"
            />
          </div>
        </div>
      </div>

      {/* MFA Settings Modal */}
      {showMfaModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }} onClick={() => setShowMfaModal(false)}>
          <div style={{
            background: 'rgba(25, 25, 45, 0.98)', border: '1px solid rgba(108, 92, 231, 0.5)',
            borderRadius: '20px', padding: '30px', width: '420px', maxWidth: '90vw',
            maxHeight: '85vh', overflowY: 'auto'
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: 'white', margin: 0 }}>🔐 Security Settings</h2>
              <button onClick={() => setShowMfaModal(false)} style={{
                background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)',
                fontSize: '1.5rem', cursor: 'pointer'
              }}>✕</button>
            </div>

            {/* MFA Status */}
            <div style={{
              background: userData.mfaEnabled ? 'rgba(46, 204, 113, 0.15)' : 'rgba(231, 76, 60, 0.15)',
              border: `1px solid ${userData.mfaEnabled ? 'rgba(46, 204, 113, 0.3)' : 'rgba(231, 76, 60, 0.3)'}`,
              borderRadius: '12px', padding: '15px', marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>{userData.mfaEnabled ? '🛡️' : '⚠️'}</span>
                <div>
                  <div style={{ color: 'white', fontWeight: '600' }}>Two-Factor Authentication</div>
                  <div style={{ color: userData.mfaEnabled ? '#2ecc71' : '#e74c3c', fontSize: '0.85rem' }}>
                    {userData.mfaEnabled ? 'Enabled — Your account is protected' : 'Disabled — Enable for extra security'}
                  </div>
                </div>
              </div>
            </div>

            {/* Encryption Info */}
            <div style={{
              background: 'rgba(108, 92, 231, 0.1)', border: '1px solid rgba(108, 92, 231, 0.3)',
              borderRadius: '12px', padding: '15px', marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.5rem' }}>🔒</span>
                <div>
                  <div style={{ color: 'white', fontWeight: '600' }}>AES-256-GCM Encryption</div>
                  <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
                    Active — All sensitive data is encrypted at rest
                  </div>
                </div>
              </div>
            </div>

            {/* Messages */}
            {mfaMsg.text && (
              <div style={{
                background: mfaMsg.type === 'success' ? 'rgba(46, 204, 113, 0.2)' : 'rgba(231, 76, 60, 0.2)',
                color: mfaMsg.type === 'success' ? '#2ecc71' : '#e74c3c',
                padding: '12px', borderRadius: '10px', marginBottom: '15px', fontSize: '0.85rem', textAlign: 'center'
              }}>
                {mfaMsg.text}
              </div>
            )}

            {/* MFA Setup Flow */}
            {!userData.mfaEnabled && mfaStep === 'idle' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '15px' }}>
                  Protect your account with Google Authenticator or any TOTP app.
                </p>
                <button className="btn-primary" style={{ padding: '14px 30px', fontSize: '0.95rem' }}
                  onClick={handleMfaSetup} disabled={mfaLoading}>
                  {mfaLoading ? '⏳ Setting up...' : '🛡️ Enable Two-Factor Auth'}
                </button>
              </div>
            )}

            {/* QR Code Step */}
            {mfaStep === 'qr' && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', marginBottom: '15px' }}>
                  1. Scan this QR code with <strong style={{color:'white'}}>Google Authenticator</strong>
                </p>

                {mfaQrCode && (
                  <div style={{ display: 'inline-block', background: 'white', padding: '16px', borderRadius: '16px', marginBottom: '15px' }}>
                    <img src={mfaQrCode} alt="MFA QR Code" style={{ width: '200px', height: '200px' }} />
                  </div>
                )}

                {mfaSecret && (
                  <div style={{ marginBottom: '15px' }}>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem', marginBottom: '5px' }}>Or enter manually:</p>
                    <code style={{
                      background: 'rgba(255,255,255,0.08)', padding: '8px 15px', borderRadius: '8px',
                      color: '#f39c12', fontSize: '0.8rem', letterSpacing: '2px', wordBreak: 'break-all'
                    }}>{mfaSecret}</code>
                  </div>
                )}

                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', margin: '15px 0 10px' }}>
                  2. Enter the 6-digit code from your app:
                </p>
                <input
                  type="text"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  style={{
                    textAlign: 'center', fontSize: '2rem', letterSpacing: '12px', fontWeight: '700',
                    padding: '12px', fontFamily: 'monospace', width: '220px',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', borderRadius: '12px'
                  }}
                />
                <div style={{ marginTop: '15px' }}>
                  <button className="btn-primary" style={{ padding: '12px 30px' }}
                    onClick={handleMfaVerifySetup}
                    disabled={mfaLoading || mfaCode.length !== 6}>
                    {mfaLoading ? '⏳ Verifying...' : '✅ Verify & Enable'}
                  </button>
                </div>
              </div>
            )}

            {/* Disable MFA Flow */}
            {userData.mfaEnabled && (mfaStep === 'idle' || mfaStep === 'disabling') && (
              <div style={{ textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', marginBottom: '15px' }}>
                  Enter your authenticator code to disable MFA:
                </p>
                <input
                  type="text"
                  placeholder="000000"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  style={{
                    textAlign: 'center', fontSize: '2rem', letterSpacing: '12px', fontWeight: '700',
                    padding: '12px', fontFamily: 'monospace', width: '220px',
                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                    color: 'white', borderRadius: '12px'
                  }}
                />
                <div style={{ marginTop: '15px' }}>
                  <button className="btn-primary" style={{
                    padding: '12px 30px',
                    background: 'linear-gradient(45deg, #e74c3c, #c0392b)'
                  }}
                    onClick={handleMfaDisable}
                    disabled={mfaLoading || mfaCode.length !== 6}>
                    {mfaLoading ? '⏳ Verifying...' : '🔓 Disable MFA'}
                  </button>
                </div>
              </div>
            )}

            {/* Done State */}
            {mfaStep === 'done' && (
              <div style={{ textAlign: 'center' }}>
                <button className="btn-primary" style={{ padding: '12px 30px', marginTop: '10px' }}
                  onClick={() => setShowMfaModal(false)}>
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}