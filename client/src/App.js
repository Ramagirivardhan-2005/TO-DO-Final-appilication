import { useEffect, useState } from "react";
import { Navigate, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import axios from "axios";
import "./App.css";
import AddTask from "./pages/AddTask";
import Dashboard from "./pages/Dashboard";
import DeleteTask from "./pages/DeleteTask";
import EditTask from "./pages/EditTask";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ScrapedEvents from "./pages/ScrapedEvents";
import Store from "./pages/Store";
import Wallet from "./pages/Wallet";
import { GoogleOAuthProvider } from '@react-oauth/google';

// SESSION TIMEOUT: 15 Minutes (in milliseconds)
const SESSION_DURATION = 15 * 60 * 1000;

// --- AXIOS JWT INTERCEPTOR ---
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem("todoToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => Promise.reject(error));

export default function App() {
  const [user, setUser] = useState(null);



  useEffect(() => {
    // Check local storage on load
    const storedUser = localStorage.getItem("todoUser");
    const loginTime = localStorage.getItem("loginTime");

    if (storedUser && loginTime) {
      const now = Date.now();
      if (now - parseInt(loginTime) > SESSION_DURATION) {
        // Session Expired
        handleLogout();
      } else {
        // Session Valid
        setUser(JSON.parse(storedUser));
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("todoUser");
    localStorage.removeItem("todoToken");
    localStorage.removeItem("loginTime");
    setUser(null);
    window.location.href = "/"; // Force redirect
  };

  return (
      <GoogleOAuthProvider clientId="994864270712-klh4cn9un6dbvkvaoi8r756npilnmds3.apps.googleusercontent.com">
        <Router>
          <Routes>
            <Route path="/" element={<Login setUser={setUser} />} />
            <Route path="/signup" element={<Signup setUser={setUser} />} />
            
            {/* Protected Routes */}
            <Route 
              path="/dashboard" 
              element={user ? <Dashboard user={user} logout={handleLogout} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/add" 
              element={user ? <AddTask user={user} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/edit/:id" 
              element={user ? <EditTask /> : <Navigate to="/" />} 
            />
            <Route 
              path="/delete/:id" 
              element={user ? <DeleteTask /> : <Navigate to="/" />} 
            />
            <Route 
              path="/events" 
              element={user ? <ScrapedEvents user={user} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/store" 
              element={user ? <Store user={user} setUser={setUser} /> : <Navigate to="/" />} 
            />
            <Route 
              path="/wallet" 
              element={user ? <Wallet user={user} setUser={setUser} /> : <Navigate to="/" />} 
            />
          </Routes>
        </Router>
      </GoogleOAuthProvider>
  );
}