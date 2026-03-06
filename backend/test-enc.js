import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import Message from './models/Message.js';

async function test() {
    console.log("Connecting to DB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected.");

    // Create a dummy message (without saving, just testing the model)
    const msg = new Message({
        channelId: new mongoose.Types.ObjectId(),
        senderId: new mongoose.Types.ObjectId(),
        text: 'Hello, this is a highly secret message!'
    });

    console.log("Raw internal text (encrypted):", msg._doc.text);
    console.log("Getter text (decrypted):", msg.text);

    const json = msg.toJSON();
    console.log("toJSON output:", json.text);

    mongoose.disconnect();
}

test().catch(console.error);
