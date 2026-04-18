import { useState, useEffect } from "react";
import axios from "axios";
import { useNavigate, useLocation } from "react-router-dom";

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
    await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/tasks`, {
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
    <div className="page-center">
      <div className="card" style={{ width: '450px', background: 'rgba(25, 25, 45, 0.95)', border: '1px solid rgba(108, 92, 231, 0.4)', borderRadius: '20px' }}>
        <h2 style={{color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}><span style={{fontSize: '1.5rem'}}>📅</span> Add New Event</h2>
        <form onSubmit={handleAdd}>
          <div className="input-group">
            <input 
              placeholder="Event Name" 
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)} 
              required 
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'inherit' }}
            />
          </div>
          
          <textarea 
            placeholder="Event Description..." 
            value={description}
            onChange={(e) => setDescription(e.target.value)} 
            rows="3"
            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', marginBottom: '15px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
          />

          <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
            <div style={{flex: 1}}>
              <label style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '5px'}}>Due Date & Time:</label>
              <input 
                type="datetime-local" 
                value={completionTime}
                onChange={(e) => setCompletionTime(e.target.value)} 
                required 
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
              />
            </div>
            <div style={{flex: 1}}>
              <label style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '5px'}}>Repeat:</label>
              <select 
                value={recurrence}
                onChange={(e) => setRecurrence(e.target.value)}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', boxSizing: 'border-box', fontFamily: 'inherit' }}
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

          <label style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', margin: '0 0 10px 0'}}>Reminders (Multiple Selection):</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px', marginBottom: '20px', color: 'white', fontSize: '0.85rem' }}>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("5m")} onChange={() => toggleReminder("5m")} /> 5m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("10m")} onChange={() => toggleReminder("10m")} /> 10m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("15m")} onChange={() => toggleReminder("15m")} /> 15m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("20m")} onChange={() => toggleReminder("20m")} /> 20m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("30m")} onChange={() => toggleReminder("30m")} /> 30m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("45m")} onChange={() => toggleReminder("45m")} /> 45m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("1h")} onChange={() => toggleReminder("1h")} /> 1h
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={reminder.includes("1d")} onChange={() => toggleReminder("1d")} /> 1d
              </label>
          </div>

          <button className="btn-primary" style={{width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 'bold', fontFamily: 'inherit'}}>Create Event</button>
        </form>
        <button className="btn-refresh" style={{width:'100%', borderRadius:'12px', marginTop:'10px', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit'}} onClick={() => navigate("/dashboard")}>Cancel</button>
      </div>
    </div>
  );
}