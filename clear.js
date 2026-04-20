// cleanup.js — удалить odilId 19/20 и перенумеровать всех подряд
// Запуск: node cleanup.js

require('dotenv').config();
const mongoose = require('mongoose');

// ===== Models =====
const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false }
);
const Counter = mongoose.model('Counter', counterSchema);

const userSchema = new mongoose.Schema(
  {
    odilId: { type: Number, unique: true },
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date, default: Date.now },
    gameData: {
      level: { type: Number, default: 1 },
      coins: { type: Number, default: 0 },
      playTime: { type: Number, default: 0 }
    }
  },
  { versionKey: false }
);
const User = mongoose.model('User', userSchema);

// ===== Config =====
const DELETE_IDS = [19, 20]; // удалить только этих

async function cleanup() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }

  console.log('Connecting...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  // 1) Показать текущих
  let users = await User.find().select('odilId username').sort({ odilId: 1 });
  console.log('BEFORE:');
  users.forEach(u => console.log(`  #${u.odilId} - ${u.username}`));
  console.log('');

  // 2) Удалить #19 и #20
  const del = await User.deleteMany({ odilId: { $in: DELETE_IDS } });
  console.log(`Deleted users with ids [${DELETE_IDS.join(', ')}]: ${del.deletedCount}\n`);

  // 3) Заново получить список и перенумеровать подряд
  users = await User.find().sort({ odilId: 1 });

  // Чтобы не словить unique конфликт при смене id:
  // сначала уводим ВСЕ odilId во временные отрицательные
  console.log('Step A: temporary negative ids...');
  for (let i = 0; i < users.length; i++) {
    users[i].odilId = -(i + 1);
  }
  await User.bulkSave(users);

  // потом ставим нормальные 1..N
  console.log('Step B: renumber to 1..N...');
  users = await User.find().sort({ odilId: 1 }); // сейчас они отрицательные, отсортируем
  users.sort((a, b) => Math.abs(a.odilId) - Math.abs(b.odilId));

  for (let i = 0; i < users.length; i++) {
    users[i].odilId = i + 1;
  }
  await User.bulkSave(users);

  const maxId = users.length;

  // 4) Сброс counter: seq = maxId => следующий будет maxId+1
  await Counter.findByIdAndUpdate(
    'userId',
    { seq: maxId },
    { upsert: true }
  );

  // 5) Показать результат
  const after = await User.find().select('odilId username').sort({ odilId: 1 });
  console.log('\nAFTER:');
  after.forEach(u => console.log(`  #${u.odilId} - ${u.username}`));

  console.log(`\nCounter set: seq=${maxId} (next id = ${maxId + 1})`);
  console.log('Done.');

  await mongoose.disconnect();
  process.exit(0);
}

cleanup().catch(async (err) => {
  console.error('Error:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});