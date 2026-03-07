import { io } from 'socket.io-client';

// Use env var if set, otherwise detect from hostname at runtime
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const BACKEND_URL = import.meta.env.VITE_SOCKET_URL ||
    (isLocalhost ? 'http://localhost:5000' : 'https://syncspace-api.onrender.com');

export const socket = io(BACKEND_URL, {
    autoConnect: false,
    withCredentials: true,
});
