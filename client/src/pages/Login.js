import axios from "axios";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { GoogleLogin } from '@react-oauth/google';

export default function Login({ setUser }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mfaMode, setMfaMode] = useState(false);
  const [mfaCode, setMfaCode] = useState("");
  const [tempToken, setTempToken] = useState("");
  const [mfaLoading, setMfaLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const [forgotStep, setForgotStep] = useState(0); 
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      handleGithubCallback(code);
    }
  }, []);

  const handleGithubCallback = async (code) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/auth/github`, { code });
      
      if (res.data.mfaRequired) {
        setMfaMode(true);
        setTempToken(res.data.tempToken);
        return;
      }

      if (res.data.token && res.data.user) {
        completeLogin(res.data);
        window.history.replaceState({}, document.title, "/");
      }
    } catch (err) {
      setError("GitHub Login failed.");
      window.history.replaceState({}, document.title, "/");
    }
  };

  const completeLogin = (data) => {
    localStorage.setItem("todoToken", data.token);
    localStorage.setItem("todoUser", JSON.stringify(data.user));
    localStorage.setItem("loginTime", Date.now().toString());
    setUser(data.user);
    navigate("/dashboard");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/login`, { username, password });
      
      if (res.data.mfaRequired) {
        // MFA required — show TOTP input
        setMfaMode(true);
        setTempToken(res.data.tempToken);
        setError("");
        return;
      }

      if (res.data.token && res.data.user) {
        completeLogin(res.data);
      } else {
        setError("Invalid credentials");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Check server.");
    }
  };

  const handleMfaVerify = async (e) => {
    e.preventDefault();
    setError("");
    setMfaLoading(true);

    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/mfa/verify-login`, {
        tempToken,
        token: mfaCode
      });

      if (res.data.token && res.data.user) {
        completeLogin(res.data);
      }
    } catch (err) {
      setError(err.response?.data?.error || "Invalid MFA code");
    }
    setMfaLoading(false);
  };

  const requestEmailMfa = async () => {
      setError(""); setMfaLoading(true); setSuccessMsg("");
      try {
          const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/auth/request-email-mfa`, { tempToken });
          if(res.data.error) setError(res.data.error);
          else setSuccessMsg(res.data.message);
      } catch(err) { setError("Failed to dispatch email code."); }
      setMfaLoading(false);
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setError(""); setForgotLoading(true); setSuccessMsg("");
    try {
        const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/auth/forgot-password`, { email: forgotEmail });
        if(res.data.error) setError(res.data.error);
        else {
            setSuccessMsg("Reset code sent! Check your email.");
            setForgotStep(2);
        }
    } catch(err) { setError("Failed to dispatch code."); }
    setForgotLoading(false);
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(""); setForgotLoading(true); setSuccessMsg("");
    try {
        const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/auth/reset-password`, { email: forgotEmail, otp: forgotOtp, newPassword });
        if(res.data.error) setError(res.data.error);
        else {
            setSuccessMsg("Password successfully reset! Please login.");
            setForgotStep(0);
            setForgotEmail(""); setForgotOtp(""); setNewPassword("");
        }
    } catch(err) { setError("Failed to reset password."); }
    setForgotLoading(false);
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    try {
      const res = await axios.post(`${process.env.REACT_APP_API_URL || "https://to-do-final-appilication-1.onrender.com"}/api/auth/google`, { googleToken: credentialResponse.credential });
      
      if (res.data.mfaRequired) {
        setMfaMode(true);
        setTempToken(res.data.tempToken);
        return;
      }

      if (res.data.token && res.data.user) {
        completeLogin(res.data);
      }
    } catch (err) {
      setError("Google Login failed.");
    }
  };

  // MFA Verification Screen
  if (mfaMode) {
    return (
      <div className="page-center">
        <div className="card mfa-card">
          <div className="app-logo">
            <span className="logo-icon">🔐</span> Two-Factor Auth
          </div>
          <p style={{ color: '#666', textAlign: 'center', marginBottom: '20px', fontSize: '0.9rem' }}>
            Enter the 6-digit code from your <br/>
            <strong>Google Authenticator</strong> app
          </p>
          
          {error && (
            <div style={{ color: 'white', backgroundColor: '#e74c3c', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>
              {error}
            </div>
          )}
          {successMsg && (
            <div style={{ color: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', border: '1px solid #2ecc71', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>
              {successMsg}
            </div>
          )}

          <form onSubmit={handleMfaVerify}>
            <div className="mfa-input-group">
              <input
                type="text"
                className="mfa-code-input"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setMfaCode(val);
                }}
                maxLength={6}
                autoFocus
                required
                style={{
                  textAlign: 'center',
                  fontSize: '2rem',
                  letterSpacing: '12px',
                  fontWeight: '700',
                  padding: '15px',
                  fontFamily: 'monospace',
                  width: '100%'
                }}
              />
            </div>
            <button 
              className="btn-primary" 
              type="submit" 
              disabled={mfaLoading || mfaCode.length !== 6}
              style={{ marginTop: '15px' }}
            >
              {mfaLoading ? '🔄 Verifying...' : '🔓 Verify & Login'}
            </button>
            <button 
              className="btn-primary" 
              type="button" 
              onClick={requestEmailMfa}
              disabled={mfaLoading}
              style={{ marginTop: '10px', background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)' }}
            >
              📧 Send Code to Email
            </button>
          </form>

          <p 
            onClick={() => { setMfaMode(false); setMfaCode(''); setError(''); setSuccessMsg(''); }}
            className="link" 
            style={{ marginTop: '15px', cursor: 'pointer', textAlign: 'center', fontSize: '0.85rem' }}
          >
            ← Back to Login
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-center">
      <div className="card">
        <div className="app-logo">
           <span className="logo-icon">⚡</span> TodoApp
        </div>
        <h2>Welcome Back</h2>
        {error && (
            <div style={{ color: 'white', backgroundColor: '#e74c3c', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>
              {error}
            </div>
        )}
        {successMsg && (
            <div style={{ color: '#2ecc71', backgroundColor: 'rgba(46, 204, 113, 0.1)', border: '1px solid #2ecc71', padding: '10px', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '15px', textAlign: 'center' }}>
              {successMsg}
            </div>
        )}

        {forgotStep === 0 && (
          <>
            <form onSubmit={handleLogin}>
              <div className="input-group">
                <input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              </div>
              <div className="input-group">
                <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'15px'}}>
                <span className="link" style={{fontSize:'0.8rem', cursor:'pointer'}} onClick={() => { setForgotStep(1); setError(''); setSuccessMsg(''); }}>Forgot Password?</span>
              </div>
              <button className="btn-primary" type="submit">Login</button>
            </form>

            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>OR</div>
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={() => setError("Google Login Exception")}
                  useOneTap
                  theme="filled_black"
                />
                <button className="btn-refresh" type="button" style={{width:'auto', minWidth:'200px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px'}} onClick={() => window.location.href = `https://github.com/login/oauth/authorize?client_id=${process.env.REACT_APP_GITHUB_CLIENT_ID || "Ov23liZrBeVKxKMXoxJ1"}&scope=user:email`}>
                    <span role="img" aria-label="github">🐙</span> Sign in with GitHub
                </button>
            </div>

            <p onClick={() => navigate("/signup")} className="link" style={{marginTop:'25px', cursor:'pointer', textAlign:'center'}}>Create an Account</p>
          </>
        )}

        {forgotStep === 1 && (
          <form onSubmit={handleForgotPassword}>
            <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: '20px', fontSize: '0.9rem' }}>
              Enter your email address to receive a secure password recovery code.
            </p>
            <div className="input-group">
              <input type="email" placeholder="Recovery Email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} required />
            </div>
            <button className="btn-primary" type="submit" disabled={forgotLoading}>
              {forgotLoading ? 'Sending...' : 'Send Recovery Code'}
            </button>
            <p onClick={() => { setForgotStep(0); setError(''); setSuccessMsg(''); }} className="link" style={{marginTop:'15px', cursor:'pointer', textAlign:'center'}}>← Back to Login</p>
          </form>
        )}

        {forgotStep === 2 && (
          <form onSubmit={handleResetPassword}>
            <p style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: '20px', fontSize: '0.9rem' }}>
              Enter the 6-digit recovery code and choose a new password.
            </p>
            <div className="input-group">
              <input type="text" placeholder="6-digit Email Pin" value={forgotOtp} onChange={(e) => setForgotOtp(e.target.value)} maxLength="6" required style={{ textAlign: 'center', letterSpacing: '8px', fontSize: '1.2rem', fontFamily: 'monospace' }} />
            </div>
            <div className="input-group" style={{marginTop: '15px'}}>
              <input type="password" placeholder="New Password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
            </div>
            <button className="btn-primary" type="submit" disabled={forgotLoading}>
              {forgotLoading ? 'Resetting...' : 'Reset Password'}
            </button>
            <p onClick={() => { setForgotStep(0); setError(''); setSuccessMsg(''); }} className="link" style={{marginTop:'15px', cursor:'pointer', textAlign:'center'}}>← Cancel</p>
          </form>
        )}
      </div>
    </div>
  );
}