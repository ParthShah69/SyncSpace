import axios from 'axios';

// Use env var if set, otherwise detect from hostname at runtime
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BASE_URL = import.meta.env.VITE_API_URL ||
    (isLocalhost ? 'http://localhost:5000/api' : 'https://syncspace-api.onrender.com/api');

const api = axios.create({
    baseURL: BASE_URL,
    withCredentials: true, // Important for sending cookies
});

export default api;
