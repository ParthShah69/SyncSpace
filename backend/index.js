import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './config/db.js';
import authRoutes from './routes/authRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import channelRoutes from './routes/channelRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import taskRoutes from './routes/taskRoutes.js';
import noteRoutes from './routes/noteRoutes.js';
import uploadRoutes from './routes/uploadRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';

dotenv.config();

// Connect to database
connectDB();

const app = express();
const httpServer = createServer(app);

// Socket.io setup
const io = new Server(httpServer, {
    cors: {
        origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
        methods: ['GET', 'POST'],
        credentials: true,
    },
});

app.set('io', io);

// Middleware
app.use(express.json());
app.use(cookieParser());
app.use(cors({
    origin: process.env.CLIENT_URL || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
    credentials: true,
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/messages', messageRoutes);
Math.random() // trigger reload hack
app.use('/api/tasks', taskRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req, res) => {
    res.send('SyncSpace API is running');
});

// Socket.io connection logic
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('joinWorkspace', (workspaceId) => {
        socket.join(workspaceId);
        console.log(`User ${socket.id} joined workspace: ${workspaceId}`);
    });

    socket.on('joinUser', (userId) => {
        socket.join(userId);
        console.log(`User ${socket.id} joined personal room: ${userId}`);
    });

    socket.on('joinChannel', (channelId) => {
        socket.join(channelId);
        console.log(`User ${socket.id} joined channel: ${channelId}`);
    });

    socket.on('sendMessage', (message) => {
        // Use socket.to() not io.to() — sender already added message optimistically
        socket.to(message.channelId).emit('newMessage', message);
    });

    // Broadcast updated read receipts to everyone in the channel
    socket.on('markRead', ({ channelId, updatedMessages }) => {
        socket.to(channelId).emit('messagesRead', { channelId, updatedMessages });
    });

    socket.on('typing', ({ channelId, user }) => {
        socket.to(channelId).emit('userTyping', { channelId, user });
    });

    socket.on('stopTyping', ({ channelId, user }) => {
        socket.to(channelId).emit('userStopTyping', { channelId, user });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
