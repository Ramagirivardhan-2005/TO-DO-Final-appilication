import axios from "axios";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Signup({ setUser }) {
  const [username, setUsername] = useState("");
  const [userid, setUserid] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    
    if (password !== confirmPassword) {
      setError("Passwords do not match!");
      return;
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,25}$/;
    
    if(!passwordRegex.test(password)) {
        setError("Password must be 8-25 chars, include 1 uppercase, 1 lowercase, 1 number, and 1 special char (@$!%*?&).");
        return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || `http://localhost:5000`}/register`, { username, userid, email, password });
      if (res.data.error) {
         setError(res.data.error);
      } else if (res.data.token && res.data.user) {
         alert("Account Created Successfully! Please Login.");
         navigate("/");
      }
    } catch (err) { 
        setError("Signup failed. Server might be down."); 
    }
    setLoading(false);
  };

  return (
    <div className="page-center">
      <div className="card">
        <div className="app-logo"><span className="logo-icon">✨</span> Join Us</div>
        
        {error && (
            <div style={{
                color:'white', backgroundColor: '#e74c3c', padding:'10px', 
                borderRadius:'8px', marginBottom:'15px', fontSize:'0.9rem', textAlign:'center'
            }}>
                {error}
            </div>
        )}

        <form onSubmit={handleSignup}>
          <div className="input-group">
            <input type="text" placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
            <input type="text" placeholder="User ID" value={userid} onChange={(e) => setUserid(e.target.value)} required />
            <input type="email" placeholder="Email Address" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          
          <div className="input-group">
            <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            <small style={{display:'block', color:'#666', fontSize:'0.7rem', marginTop:'5px'}}>
              Min 8 chars, 1 Upper, 1 Lower, 1 Number, 1 Special
            </small>
            <input type="password" placeholder="Confirm Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required style={{marginTop: '10px'}}/>
          </div>

          <button type="submit" className="btn-primary" disabled={loading} style={{marginTop:'10px'}}>
             {loading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        <p onClick={() => navigate("/")} className="link" style={{textAlign:'center', marginTop:'10px', cursor:'pointer'}}>Back to Login</p>
      </div>
    </div>
  );
}