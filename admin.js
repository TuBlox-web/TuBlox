#!/usr/bin/env node
// admin.js — локальная админка в CMD для MongoDB
// Запуск:
//   node admin.js list
//   node admin.js info <username>
//   node admin.js delete <username>
//   node admin.js grant  <username> <badgeId>
//   node admin.js revoke <username> <badgeId>
//   node admin.js ban    <username> [reason]
//   node admin.js unban  <username>
//   node admin.js fixid [--show]

require('dotenv').config();
const mongoose = require('mongoose');

// =====================
// Schemas
// =====================

const counterSchema = new mongoose.Schema(
  { _id: String, seq: { type: Number, default: 0 } },
  { versionKey: false }
);
const Counter = mongoose.model('Counter', counterSchema);

const userSchema = new mongoose.Schema(
  {
    odilId:        { type: Number, unique: true },
    username:      { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:      { type: String, required: true },
    discordId:     { type: String, unique: true, sparse: true, default: null },
    discordAvatar: { type: String, default: null },
    badges:        { type: [String], default: [] },
    createdAt:     { type: Date, default: Date.now },
    lastLogin:     { type: Date, default: Date.now },
    lastSeen:      { type: Date, default: Date.now },
    gameData: {
      level:    { type: Number, default: 1 },
      coins:    { type: Number, default: 0 },
      playTime: { type: Number, default: 0 }
    }
  },
  { versionKey: false }
);
const User = mongoose.model('User', userSchema);

const banSchema = new mongoose.Schema(
  {
    odilId:    Number,
    ip:        String,
    reason:    String,
    bannedBy:  Number,
    bannedAt:  { type: Date, default: Date.now },
    expiresAt: { type: Date, default: null }
  },
  { versionKey: false }
);
const Ban = mongoose.model('Ban', banSchema);

const whitelistSchema = new mongoose.Schema(
  {
    odilId:      { type: Number, unique: true, required: true },
    username:    { type: String, required: true },
    status:      { type: String, default: 'approved' },
    requestedAt: { type: Date, default: Date.now },
    approvedAt:  { type: Date }
  },
  { versionKey: false }
);
const Whitelist = mongoose.model('Whitelist', whitelistSchema);

const launchTokenSchema = new mongoose.Schema(
  {
    token:     { type: String, unique: true },
    odilId:    { type: Number, required: true },
    username:  { type: String, required: true },
    gameId:    { type: String, required: true },
    createdAt: { type: Date, default: Date.now, expires: 300 }
  },
  { versionKey: false }
);
const LaunchToken = mongoose.model('LaunchToken', launchTokenSchema);

const forumPostSchema = new mongoose.Schema(
  {
    postId:     { type: Number, unique: true },
    authorId:   { type: Number, required: true },
    authorName: { type: String, required: true },
    title:      String,
    content:    String,
    category:   String,
    likes:      [Number],
    views:      Number,
    replies:    Number,
    isPinned:   Boolean,
    isLocked:   Boolean,
    createdAt:  Date,
    updatedAt:  Date
  },
  { versionKey: false }
);
const ForumPost = mongoose.model('ForumPost', forumPostSchema);

const forumReplySchema = new mongoose.Schema(
  {
    replyId:    { type: Number, unique: true },
    postId:     { type: Number, required: true },
    authorId:   { type: Number, required: true },
    authorName: { type: String, required: true },
    content:    String,
    likes:      [Number],
    createdAt:  Date
  },
  { versionKey: false }
);
const ForumReply = mongoose.model('ForumReply', forumReplySchema);

// =====================
// Utils
// =====================

function usage() {
  console.log(`
Usage:
  node admin.js list
  node admin.js info   <username>
  node admin.js delete <username>
  node admin.js grant  <username> <badgeId>
  node admin.js revoke <username> <badgeId>
  node admin.js ban    <username> [reason]
  node admin.js unban  <username>
  node admin.js fixid  [--show]

Examples:
  node admin.js list
  node admin.js info today_idk
  node admin.js delete debil
  node admin.js grant  today_idk Staff
  node admin.js revoke today_idk Staff
  node admin.js ban    debil "Breaking rules"
  node admin.js unban  debil
  node admin.js fixid
  node admin.js fixid --show
`);
}

function normUsername(u) {
  return String(u || '').toLowerCase().trim();
}

async function connect() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI missing in .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);
}

async function disconnect(ok = true) {
  try { await mongoose.disconnect(); } catch {}
  process.exit(ok ? 0 : 1);
}

// =====================
// Commands
// =====================

async function cmdList() {
  // FIX: сортировка по odilId числом (не строкой)
  const users = await User.find()
    .select('odilId username badges')
    .sort({ odilId: 1 })
    .lean();

  if (!users.length) {
    console.log('No users found.');
    return;
  }

  // Получаем всех забаненных одним запросом
  const bannedIds = new Set(
    (await Ban.find({ odilId: { $in: users.map(u => u.odilId) } })
      .select('odilId')
      .lean()
    ).map(b => b.odilId)
  );

  users.forEach(u => {
    const b    = (u.badges && u.badges.length) ? ` badges=[${u.badges.join(',')}]` : '';
    const ban  = bannedIds.has(u.odilId) ? ' [BANNED]' : '';
    console.log(`#${String(u.odilId).padEnd(4)} ${u.username}${b}${ban}`);
  });

  const c = await Counter.findById('userId').lean();
  if (c) {
    console.log(`\nCounter(userId).seq = ${c.seq}  →  next id = ${c.seq + 1}`);
  }
}

async function cmdInfo(username) {
  username = normUsername(username);
  if (!username) return usage();

  const u = await User.findOne({ username }).lean();
  if (!u) { console.log('User not found'); return; }

  console.log(JSON.stringify({
    odilId:    u.odilId,
    username:  u.username,
    badges:    u.badges || [],
    discordId: u.discordId || null,
    createdAt: u.createdAt,
    lastLogin: u.lastLogin,
    lastSeen:  u.lastSeen,
    gameData:  u.gameData
  }, null, 2));

  const ban = await Ban.findOne({ odilId: u.odilId }).lean();
  if (ban) {
    console.log('\n[BANNED]');
    console.log('  Reason   :', ban.reason || '(no reason)');
    console.log('  BannedAt :', ban.bannedAt);
    console.log('  ExpiresAt:', ban.expiresAt || 'permanent');
  } else {
    console.log('\nNot banned.');
  }
}

async function cmdDelete(username) {
  username = normUsername(username);
  if (!username) return usage();

  const user = await User.findOne({ username });
  if (!user) { console.log('User not found'); return; }

  const odilId = user.odilId;

  await Promise.allSettled([
    Ban.deleteMany({ odilId }),
    Whitelist.deleteMany({ odilId }),
    LaunchToken.deleteMany({ odilId }),
    ForumPost.deleteMany({ authorId: odilId }),
    ForumReply.deleteMany({ authorId: odilId })
  ]);

  await User.deleteOne({ _id: user._id });

  console.log(`Deleted user: ${username} (#${odilId})`);
  console.log('Note: IDs are not reindexed. Use "fixid" if needed.');
}

async function cmdGrant(username, badgeId) {
  username = normUsername(username);
  badgeId  = String(badgeId || '').trim();
  if (!username || !badgeId) return usage();

  const u = await User.findOneAndUpdate(
    { username },
    { $addToSet: { badges: badgeId } },
    { new: true }
  );
  if (!u) { console.log('User not found'); return; }

  console.log(`Granted badge "${badgeId}" to ${u.username} (#${u.odilId})`);
  console.log('Badges:', u.badges || []);
}

async function cmdRevoke(username, badgeId) {
  username = normUsername(username);
  badgeId  = String(badgeId || '').trim();
  if (!username || !badgeId) return usage();

  const u = await User.findOneAndUpdate(
    { username },
    { $pull: { badges: badgeId } },
    { new: true }
  );
  if (!u) { console.log('User not found'); return; }

  console.log(`Revoked badge "${badgeId}" from ${u.username} (#${u.odilId})`);
  console.log('Badges:', u.badges || []);
}

async function cmdBan(username, reason) {
  username = normUsername(username);
  if (!username) return usage();

  const user = await User.findOne({ username }).lean();
  if (!user) { console.log('User not found'); return; }

  // Проверяем — уже забанен?
  const existing = await Ban.findOne({ odilId: user.odilId });
  if (existing) {
    console.log(`User ${username} (#${user.odilId}) is already banned.`);
    console.log('Reason:', existing.reason || '(none)');
    console.log('Use "unban" first if you want to re-ban.');
    return;
  }

  await Ban.create({
    odilId:    user.odilId,
    reason:    reason || 'Banned by admin',
    bannedBy:  1,
    bannedAt:  new Date(),
    expiresAt: null  // permanent
  });

  console.log(`Banned: ${username} (#${user.odilId})`);
  console.log('Reason:', reason || 'Banned by admin');
  console.log('Type: permanent (expiresAt = null)');
}

async function cmdUnban(username) {
  username = normUsername(username);
  if (!username) return usage();

  const user = await User.findOne({ username }).lean();
  if (!user) { console.log('User not found'); return; }

  const result = await Ban.deleteMany({ odilId: user.odilId });

  if (result.deletedCount === 0) {
    console.log(`User ${username} (#${user.odilId}) is not banned.`);
  } else {
    console.log(`Unbanned: ${username} (#${user.odilId})`);
    console.log(`Removed ${result.deletedCount} ban record(s).`);
  }
}

async function cmdFixId(showOnly = false) {
  const maxUser = await User.findOne()
    .sort({ odilId: -1 })
    .select('odilId username')
    .lean();

  const maxId     = maxUser?.odilId ?? 0;
  const counter   = await Counter.findById('userId').lean();
  const currentSeq = counter?.seq ?? 0;

  console.log(`Max odilId in Users : ${maxId} (${maxUser ? maxUser.username : 'none'})`);
  console.log(`Counter(userId).seq : ${currentSeq}  →  next id would be ${currentSeq + 1}`);

  if (showOnly) {
    console.log('\n[--show] No changes made.');
    return;
  }

  await Counter.findByIdAndUpdate('userId', { seq: maxId }, { upsert: true });
  console.log(`\nFixed: Counter(userId).seq → ${maxId}  (next id = ${maxId + 1})`);
}

// =====================
// Main
// =====================

(async function main() {
  const args = process.argv.slice(2);
  const cmd  = args[0];
  const a1   = args[1];
  // reason может быть несколько слов: node admin.js ban user broken rules
  const rest = args.slice(2).join(' ');

  if (!cmd) { usage(); process.exit(0); }

  try {
    await connect();

    if      (cmd === 'list')   await cmdList();
    else if (cmd === 'info')   await cmdInfo(a1);
    else if (cmd === 'delete') await cmdDelete(a1);
    else if (cmd === 'grant')  await cmdGrant(a1, args[2]);
    else if (cmd === 'revoke') await cmdRevoke(a1, args[2]);
    else if (cmd === 'ban')    await cmdBan(a1, rest || undefined);
    else if (cmd === 'unban')  await cmdUnban(a1);
    else if (cmd === 'fixid')  await cmdFixId(args.includes('--show'));
    else usage();

    await disconnect(true);
  } catch (err) {
    console.error('Error:', err.message);
    await disconnect(false);
  }
})();