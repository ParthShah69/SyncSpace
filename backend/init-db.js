import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Import all models to ensure their schemas are registered
import User from './models/User.js';
import Workspace from './models/Workspace.js';
import Channel from './models/Channel.js';
import Message from './models/Message.js';
import Task from './models/Task.js';
import Note from './models/Note.js';
import OTP from './models/OTP.js';

async function initDatabase() {
    try {
        console.log('Connecting to the database to initialize collections...');
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        console.log(`Connected. Database: "${db.databaseName}"`);

        const models = [User, Workspace, Channel, Message, Task, Note, OTP];

        for (const Model of models) {
            await Model.createCollection();
            console.log(`  ✓ Initialized collection: ${Model.collection.name}`);
        }

        console.log('\n✅ Database collections fully initialized!');
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

initDatabase();
