// match.js
const { ref, update, get } = require('firebase/database');

const teammateQueue = {
  ranked: [],
  classic: []
};
const chatPairs = {}; // userId: partnerId
// بالای فایل
const chatHistory = {}; // key: `${userA}_${userB}`; value: array of messages

function getChatKey(userA, userB) {
  return [userA, userB].sort().join('_');
}

// پاکسازی پیام‌های بالای ۲ روز (۴۸ ساعت)
function cleanOldChats(hours = 48) {
  const now = Date.now();
  const expireMs = hours * 60 * 60 * 1000;
  for (const key in chatHistory) {
    chatHistory[key] = chatHistory[key].filter(msg =>
      now - new Date(msg.date).getTime() < expireMs
    );
    if (chatHistory[key].length === 0) delete chatHistory[key];
  }
}



function getMaxDailyChance(user) {
  // اگر maxDailyChance دستی ست شده بود، همان را برگردان
  if (user.maxDailyChance) return user.maxDailyChance;
  return 3 + Math.floor((user.invites || 0) / 5);
}
async function getUser(db, userId) {
  const snap = await get(ref(db, `users/${userId}`));
  return snap.exists() ? snap.val() : null;
}

async function addToQueue({ userId, mode, db, bot, userState }) {
  // اگر کسی تو صف هست که منتظر همین مود باشه
  if (teammateQueue[mode].length > 0) {
    const partnerId = teammateQueue[mode].shift();
    // هر دو طرف وارد چت ناشناس میشن
    chatPairs[userId] = partnerId;
    chatPairs[partnerId] = userId;

    userState[userId] = { step: 'in_anonymous_chat', chatPartner: partnerId, mode };
    userState[partnerId] = { step: 'in_anonymous_chat', chatPartner: userId, mode };

    // شانس روزانه کم کن
    const user = await getUser(db, userId);
    const partner = await getUser(db, partnerId);
    await update(ref(db, `users/${userId}`), { findChanceUsed: (user.findChanceUsed || 0) + 1 });
    await update(ref(db, `users/${partnerId}`), { findChanceUsed: (partner.findChanceUsed || 0) + 1 });

    // اطلاعات پروفایل برای نمایش به طرف مقابل
    const info1 = user.teammate_profile?.desc || 'بدون اطلاعات';
    const info2 = partner.teammate_profile?.desc || 'بدون اطلاعات';

    // پیام و دکمه
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '❌ لغو چت', callback_data: 'anon_cancel' }],
          [{ text: '✅ موافقت و خروج', callback_data: 'anon_accept' }],
          [{ text: '🚨 گزارش کاربر', callback_data: 'anon_report' }]
        ]
      }
    };

    await bot.sendMessage(userId, `✅ یک هم‌تیمی برای شما پیدا شد!\n\nاطلاعات طرف مقابل:\n${info2}\n\nچت ناشناس فعال شد، پیام بده!`, keyboard);
    await bot.sendMessage(partnerId, `✅ یک هم‌تیمی برای شما پیدا شد!\n\nاطلاعات طرف مقابل:\n${info1}\n\nچت ناشناس فعال شد، پیام بده!`, keyboard);
    return true;
  } else {
    // وارد صف بشه
    teammateQueue[mode].push(userId);
    await bot.sendMessage(userId, `در حال جستجو برای هم‌تیمی (${mode === 'ranked' ? 'رنک' : 'کلاسیک'})...\nتا پیدا شدن چت کنسل نمی‌شه.\nبرای لغو /cancel را بزنید.`);
    return false;
  }
}

function removeFromQueue(userId) {
  for (const mode of Object.keys(teammateQueue)) {
    teammateQueue[mode] = teammateQueue[mode].filter(id => id !== userId);
  }
}

function leaveChat(userId, userState, bot, returnChanceForPartner = false, db = null) {
  const partnerId = chatPairs[userId];
  delete chatPairs[userId];
  if (partnerId) {
    delete chatPairs[partnerId];
    if (userState[partnerId]?.step === 'in_anonymous_chat') {
      userState[partnerId] = null;
      bot.sendMessage(partnerId, 'طرف مقابل چت را لغو کرد.');
      // اگر باید شانس طرف مقابل برگرده
      if (returnChanceForPartner && db) {
        (async () => {
          const partner = await getUser(db, partnerId);
          if (partner) {
            await update(ref(db, `users/${partnerId}`), { findChanceUsed: Math.max((partner.findChanceUsed || 1) - 1, 0) });
            bot.sendMessage(partnerId, 'شانس روزانه شما برگشت.');
          }
        })();
      }
    }
  }
  userState[userId] = null;
}

function isInChat(userId) {
  return !!chatPairs[userId];
}

module.exports = {
  teammateQueue,
  chatPairs,
  chatHistory,
  getChatKey,
  cleanOldChats,
  getMaxDailyChance,
  addToQueue,
  removeFromQueue,
  leaveChat,
  isInChat
};