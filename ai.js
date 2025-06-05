const { getDatabase, ref, get, set } = require('firebase/database');
const { askAI } = require('./openai'); // فرض بر این است که تابع askAI در فایل openai.js پیاده شده
const { clearUserState } = require('./utils'); // یا هرجایی که تابع مدیریت state ذخیره شده

const db = getDatabase();
const adminId = 381183017; // عدد آیدی عددی ادمین

async function handleAIQuestion(userId, text, bot) {
  await clearUserState(userId);

  const userRef = ref(db, `users/${userId}`);
  const snapshot = await get(userRef);
  const userData = snapshot.val() || {};

  const today = new Date().toISOString().split('T')[0];
  const isAdmin = userId === adminId;

  let aiChat = userData.aiChat || { count: 0, lastDate: today };

  if (aiChat.lastDate !== today) {
    aiChat = { count: 0, lastDate: today };
  }

  if (!isAdmin && aiChat.count >= 2) {
    return bot.sendMessage(userId, '❌ شما امروز بیش از ۲ سوال پرسیده‌اید.');
  }

  try {
    const answer = await askAI(text);
    await bot.sendMessage(userId, `🤖 پاسخ:\n${answer}`);

    if (!isAdmin) {
      aiChat.count += 1;
      aiChat.lastDate = today;
      await set(ref(db, `users/${userId}/aiChat`), aiChat);
    }
  } catch (error) {
    console.error('خطا در پاسخ AI:', error);
    return bot.sendMessage(userId, '❌ خطایی در دریافت پاسخ از هوش مصنوعی رخ داد.');
  }
}

module.exports = { handleAIQuestion };