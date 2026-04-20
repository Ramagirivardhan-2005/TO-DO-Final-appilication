import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";
import { API_URL } from "../config";

export default function AddTask({ user }) {
  const [taskName, setTaskName] = useState("");
  const [description, setDescription] = useState("");
  const [completionTime, setCompletionTime] = useState("");
  const [reminder, setReminder] = useState([]);
  const [recurrence, setRecurrence] = useState("None");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const query = new URLSearchParams(location.search);
    const dateParam = query.get("date");
    if (dateParam) {
      setCompletionTime(dateParam + "T12:00"); 
    }
  }, [location]);

  const toggleReminder = (value) => {
      setReminder(prev => 
          prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value]
      );
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    await axios.post(`${API_URL}/tasks`, {
      user_id: user.id,
      task_name: taskName,
      description: description,
      reminder: reminder,
      recurrence: recurrence,
      completion_time: completionTime,
      priority: "Auto"
    });
    navigate("/dashboard");
  };

  return (
    <div className="page-center login-page">
      <div className="card login-card" style={{ width: '100%', maxWidth: '500px' }}>
        <h2 style={{marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}>
            <span style={{fontSize: '1.5rem'}}>📅</span> Add New Event
        </h2>
        <form onSubmit={handleAdd}>
          <div className="input-group">
            <input 
              placeholder="Event Name" 
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)} 
              required 
            />
          </div>
          
          <textarea 
            placeholder="Event Description..." 
            value={description}
            onChange={(e) => setDescription(e.target.value)} 
            rows="3"
            className="styled-input"
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
          />

          <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
            <div style={{flex: 1}}>
              <label className="input-label">Due Date & Time:</label>
              <input 
                type="datetime-local" 
                value={completionTime}
                onChange={(e) => setCompletionTime(e.target.value)} 
                required 
              />
            </div>
            <div style={{flex: 1}}>
              <label className="input-label">Repeat:</label>
              <select 
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                className="styled-input"
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="None">Does not repeat</option>
                <option value="min">Every Minute</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <label className="input-label">Reminders (Multiple Selection):</label>
          <div className="reminder-grid">
              {['5m', '10m', '15m', '20m', '30m', '45m', '1h', '1d'].map(val => (
                <label key={val} className="reminder-checkbox">
                  <input type="checkbox" checked={reminder.includes(val)} onChange={() => toggleReminder(val)} /> {val}
                </label>
              ))}
          </div>

          <button className="btn-primary" style={{width: '100%', padding: '14px', fontSize: '1rem', marginTop: '10px'}}>
             Create Event
          </button>
        </form>
        <button 
            className="btn-refresh" 
            style={{width:'100%', borderRadius:'12px', marginTop:'15px', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-main)'}} 
            onClick={() => navigate("/dashboard")}
        >
            Cancel
        </button>
      </div>
    </div>
  );
}