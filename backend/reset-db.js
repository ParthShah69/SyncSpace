import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

// Build URI pointing to the 'test' database (where old data lives)
const BASE_URI = process.env.MONGODB_URI;
const TEST_URI = BASE_URI;

async function resetDatabase() {
    try {
        console.log('Connecting to the "test" database to clear old data...');
        await mongoose.connect(TEST_URI);
        const db = mongoose.connection.db;
        const dbName = db.databaseName;
        console.log(`Connected. Database: "${dbName}"`);

        const collections = await db.listCollections().toArray();
        console.log(`Found ${collections.length} collections: ${collections.map(c => c.name).join(', ')}`);

        if (collections.length === 0) {
            console.log('✅ Already empty!');
            await mongoose.disconnect();
            process.exit(0);
        }

        for (const col of collections) {
            try {
                const result = await db.collection(col.name).deleteMany({});
                console.log(`  ✓ Cleared ${result.deletedCount} docs from: ${col.name}`);
            } catch (err) {
                console.log(`  ✗ Failed to clear: ${col.name}`, err.message);
            }
        }

        const remaining = await db.listCollections().toArray();
        const stillHasData = await Promise.all(remaining.map(c => db.collection(c.name).countDocuments()));
        const totalDocs = stillHasData.reduce((a, b) => a + b, 0);

        if (totalDocs === 0) {
            console.log('\n✅ Database fully cleared! Fresh start ready.');
        } else {
            console.log(`\n⚠️  Some data remains. Total documents left: ${totalDocs}`);
        }

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

resetDatabase();
