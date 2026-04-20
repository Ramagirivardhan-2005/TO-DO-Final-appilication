import axios from "axios";
import { useEffect, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { API_URL } from "../config";

export default function EditTask() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [data, setData] = useState({ task_name: "", description: "", completion_time: "", reminder: [], recurrence: "None" });
  
  const isSeries = new URLSearchParams(location.search).get("series") === "true";

  useEffect(() => {
    axios.get(`${API_URL}/task/${id}`) 
      .then(res => {
        const formattedData = {
            ...res.data,
            completion_time: res.data.completion_time ? res.data.completion_time.slice(0, 16) : "",
            reminder: Array.isArray(res.data.reminder) ? res.data.reminder : [],
            description: res.data.description || "",
            recurrence: res.data.recurrence || "None"
        };
        setData(formattedData);
    }).catch(err => {
        // Fallback for retrieving list and finding it if /task/:id doesn't exist
        const currentUser = JSON.parse(localStorage.getItem('todoUser'));
        if(currentUser) {
            axios.get(`${API_URL}/tasks/${currentUser.id}`).then(res => {
                const found = res.data.find(t => t._id === id);
                if (found) {
                    setData({
                        ...found,
                        completion_time: found.completion_time ? found.completion_time.slice(0, 16) : "",
                        reminder: Array.isArray(found.reminder) ? found.reminder : [],
                        description: found.description || "",
                        recurrence: found.recurrence || "None"
                    });
                }
            });
        }
    });
  }, [id]);

  const toggleReminder = (value) => {
      setData(prev => ({
          ...prev,
          reminder: prev.reminder.includes(value) ? prev.reminder.filter(r => r !== value) : [...prev.reminder, value]
      }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    let url = `${API_URL}/tasks/${id}`;
    if (isSeries) url += `?series=true`;
    await axios.put(url, data);
    navigate("/dashboard");
  };

  return (
    <div className="page-center">
      <div className="card" style={{ width: '450px', background: 'rgba(25, 25, 45, 0.95)', border: '1px solid rgba(108, 92, 231, 0.4)', borderRadius: '20px' }}>
        <h2 style={{color: 'white', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px'}}><span style={{fontSize: '1.5rem'}}>✏️</span> Edit {isSeries ? 'Series' : 'Event'}</h2>
        <form onSubmit={handleUpdate}>
          <div className="input-group">
            <input 
              placeholder="Event Name" 
              value={data.task_name}
              onChange={(e) => setData({...data, task_name: e.target.value})} 
              required 
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontFamily: 'inherit' }}
            />
          </div>
          
          <textarea 
            placeholder="Event Description..." 
            value={data.description}
            onChange={(e) => setData({...data, description: e.target.value})} 
            rows="3"
            style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', marginBottom: '15px', boxSizing: 'border-box', fontFamily: 'inherit', resize: 'vertical' }}
          />

          <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
            <div style={{flex: 1}}>
              <label style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '5px'}}>Due Date & Time:</label>
              <input 
                type="datetime-local" 
                value={data.completion_time}
                onChange={(e) => setData({...data, completion_time: e.target.value})} 
                required={!isSeries}
                disabled={isSeries} 
                title={isSeries ? "Cannot change time for an entire series at once" : ""}
                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', borderRadius: '12px', boxSizing: 'border-box', opacity: isSeries ? 0.5 : 1, fontFamily: 'inherit' }}
              />
            </div>
            <div style={{flex: 1}}>
              <label style={{fontSize: '12px', color: 'rgba(255,255,255,0.6)', display: 'block', marginBottom: '5px'}}>Repeat:</label>
              <select 
                value={data.recurrence}
                onChange={(e) => setData({...data, recurrence: e.target.value})}
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
                <input type="checkbox" checked={data.reminder.includes("5m")} onChange={() => toggleReminder("5m")} /> 5m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("10m")} onChange={() => toggleReminder("10m")} /> 10m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("15m")} onChange={() => toggleReminder("15m")} /> 15m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("20m")} onChange={() => toggleReminder("20m")} /> 20m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("30m")} onChange={() => toggleReminder("30m")} /> 30m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("45m")} onChange={() => toggleReminder("45m")} /> 45m
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("1h")} onChange={() => toggleReminder("1h")} /> 1h
              </label>
              <label style={{display: 'flex', alignItems:'center', gap:'5px', cursor: 'pointer', background: 'rgba(255,255,255,0.05)', padding: '6px', borderRadius: '8px'}}>
                <input type="checkbox" checked={data.reminder.includes("1d")} onChange={() => toggleReminder("1d")} /> 1d
              </label>
          </div>

          <button className="btn-primary" style={{width: '100%', padding: '14px', fontSize: '1rem', fontWeight: 'bold', fontFamily: 'inherit'}}>Save Changes</button>
        </form>
        <button className="btn-refresh" style={{width:'100%', borderRadius:'12px', marginTop:'10px', padding: '12px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit'}} onClick={() => navigate("/dashboard")}>Cancel</button>
      </div>
    </div>
  );
}