const { ref, update, get } = require('firebase/database');

// ---------------------
// فرض: این آبجکت در ابتدای فایل هست یا در ماژول اصلی تعریف شده و import میشه
const blockedUsers = {}; // { userId: [blockedUserId, ...], ... }
// ---------------------

const teammateQueue = {
  ranked: [],
  classic: []
};
const chatPairs = {}; // userId: partnerId
const chatHistory = {}; // key: `${userA}_${userB}`; value: array of messages

function getChatKey(userA, userB) {
  return [userA, userB].sort().join('_');
}

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

function profileToString(profile) {
  if (!profile) return '👤بدون اطلاعات';
  return [
    `🏅 رنک: ${profile.rank || 'نامشخص'}`,
    `🦸‍♂️ هیرو مین: ${profile.mainHero || 'نامشخص'}`,
    `🎯 رول: ${profile.mainRole || 'نامشخص'}`,
    `🆔 آیدی/اسم: ${profile.gameId || 'نامشخص'}`
  ].join('\n');
}

function getMaxDailyChance(user) {
  if (user.maxDailyChance) return user.maxDailyChance;
  return 3 + Math.floor((user.invites || 0) / 5);
}

async function getUser(db, userId) {
  const snap = await get(ref(db, `users/${userId}`));
  return snap.exists() ? snap.val() : null;
}

// ------------ ویرایش اصلی اینجاست: addToQueue ---------------
async function addToQueue({ userId, mode, db, bot, userState }) {
  // حلقه تا زمانی که کسی در صف باشد
  for (let i = 0; i < teammateQueue[mode].length; i++) {
    const partnerId = teammateQueue[mode][i];

    // اگر رابطه بلاک بین این دو نفر وجود دارد
    if (
      (blockedUsers[userId] && blockedUsers[userId].includes(partnerId)) ||
      (blockedUsers[partnerId] && blockedUsers[partnerId].includes(userId))
    ) {
      continue; // این دو نفر نباید مچ بشن، برو سراغ بعدی
    }

    // اگر به اینجا رسید یعنی جفت مناسبه
    // حالا partnerId رو از صف بردار (با splice)
    teammateQueue[mode].splice(i, 1);

    // بقیه کد جفت کردن مثل قبل:
    chatPairs[userId] = partnerId;
    chatPairs[partnerId] = userId;
    userState[userId].anon_canceled = false;
    userState[partnerId].anon_canceled = false;
    userState[userId] = { step: 'in_anonymous_chat', chatPartner: partnerId, mode };
    userState[partnerId] = { step: 'in_anonymous_chat', chatPartner: userId, mode };

    // شانس روزانه کم کن (و بقیه...)
    const user = await getUser(db, userId);
    const partner = await getUser(db, partnerId);
    await update(ref(db, `users/${userId}`), { findChanceUsed: (user.findChanceUsed || 0) + 1 });
    await update(ref(db, `users/${partnerId}`), { findChanceUsed: (partner.findChanceUsed || 0) + 1 });

    const info1 = profileToString(user.teammate_profile);
    const info2 = profileToString(partner.teammate_profile);

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔙 رضایت و خروج', callback_data: 'anon_cancel' }],
          [{ text: '⛔ بلاک کردن کاربر', callback_data: 'anon_block' }],
          [{ text: '🚨 گزارش کاربر', callback_data: 'anon_report' }]
        ]
      }
    };

    await bot.sendMessage(userId, `✅ یک هم‌تیمی برای شما پیدا شد!\n\nاطلاعات طرف مقابل:\n${info2}\n\nچت ناشناس  از همین الان فعال شد، پیام بده!`, keyboard);
    await bot.sendMessage(partnerId, `✅ یک هم‌تیمی برای شما پیدا شد!\n\nاطلاعات طرف مقابل:\n${info1}\n\nچت ناشناس فعال شد، پیام بده!`, keyboard);
    return true;
  }

  // اگر هیچ کسی مناسب نبود، کاربر فعلی بره تو صف
  teammateQueue[mode].push(userId);
  await bot.sendMessage(userId, `🔎در حال جستجو برای هم‌تیمی (${mode === 'ranked' ? 'رنک' : 'کلاسیک'})...\nتا پیدا شدن چت کنسل نمی‌شه.\nبرای لغو /cancel را بزنید.`);
  return false;
}
// ------------ پایان بخش ویرایش اصلی -------------

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
      bot.sendMessage(partnerId, 'طرف مقابل چت را لغو کرد!');
      if (returnChanceForPartner && db) {
        (async () => {
          const partner = await getUser(db, partnerId);
          if (partner) {
            await update(ref(db, `users/${partnerId}`), { findChanceUsed: Math.max((partner.findChanceUsed || 1) - 1, 0) });
            bot.sendMessage(partnerId, '🎟️شانس روزانه شما برگشت.');
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
  isInChat,
  // اگر جای دیگری هم نیاز داشتی
  // blockedUsers
};