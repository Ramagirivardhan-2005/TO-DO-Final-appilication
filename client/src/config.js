
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_URL = isLocalhost 
    ? "http://localhost:5000" 
    : (process.env.REACT_APP_API_URL || "https://to-do-final-appilication-5.onrender.com");
export const FRONTEND_URL = isLocalhost 
    ? "http://localhost:3000" 
    : (process.env.REACT_APP_FRONTEND_URL || "https://to-do-final-appilication-n1ds.vercel.app");
export const GITHUB_CLIENT_ID = process.env.REACT_APP_GITHUB_CLIENT_ID || "Ov23liZrBeVKxKMXoxJ1";
