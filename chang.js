const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGODB_URI = 'mongodb+srv://Today_Idk:TpdauT434odayTodayToday23@cluster0.rlgkop5.mongodb.net/Tublox?retryWrites=true&w=majority&appName=Cluster0';

const userSchema = new mongoose.Schema({
    username: String,
    password: String
});

const User = mongoose.model('User', userSchema);

async function resetPassword() {
    await mongoose.connect(MONGODB_URI);
    console.log('[DB] Connected');

    const newHash = await bcrypt.hash('ttoster_02', 12);
    
    const result = await User.updateOne(
        { username: 'toster' },
        { password: newHash }
    );

    if (result.modifiedCount > 0) {
        console.log('[OK] Password changed successfully');
    } else {
        console.log('[!] User not found');
    }

    await mongoose.disconnect();
}

resetPassword().catch(console.error);