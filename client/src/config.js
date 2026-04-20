// Automatically detect if running on localhost
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// If testing locally, go to local backend (5000) by default, else use production Render URL
export const API_URL = isLocalhost 
    ? "http://localhost:5000" 
    : (process.env.REACT_APP_API_URL || "https://to-do-final-appilication-3.onrender.com");

// If testing locally, frontend URL is localhost:3000, else use Vercel production URL
export const FRONTEND_URL = isLocalhost 
    ? "http://localhost:3000" 
    : (process.env.REACT_APP_FRONTEND_URL || "https://to-do-final-appilication.vercel.app");

export const GITHUB_CLIENT_ID = process.env.REACT_APP_GITHUB_CLIENT_ID || "Ov23liZrBeVKxKMXoxJ1";
