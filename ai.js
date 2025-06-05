const cohere = require('cohere-ai');

const COHERE_API_KEY = process.env.COHERE_API_KEY || 'کلید_تو_اینجا_بذار';
cohere.init(COHERE_API_KEY);

/**
 * ارسال پیام به cohere و دریافت پاسخ
 * @param {string} message پیام کاربر
 * @returns {Promise<string>} پاسخ AI
 */
async function askAI(message) {
  try {
    const response = await cohere.generate({
      model: 'command-xlarge-nightly',
      prompt: message,
      max_tokens: 150,
      temperature: 0.7,
      stop_sequences: ['User:', 'Assistant:'],
    });

    const reply = response.body.generations[0].text.trim();
    return reply;

  } catch (error) {
    console.error('Error in askAI:', error);
    return 'خطایی رخ داد، لطفا دوباره تلاش کنید.';
  }
}

/**
 * ست کردن وضعیت کاربر در دیتابیس
 * @param {number|string} userId شناسه کاربر
 * @param {string} state وضعیت جدید
 */
async function setUserState(userId, state) {
  // این تابع باید تو index.js تعریف بشه چون db اونجا هست
  // پس اینجا فقط ارور نده و می‌تونی از اینجا اینجا تعریف نکنی یا بعداً تعریف کنی
  throw new Error('setUserState is not implemented');
}

/**
 * پاک کردن وضعیت کاربر از دیتابیس
 * @param {number|string} userId شناسه کاربر
 */
async function clearUserState(userId) {
  // این تابع هم مثل بالا فقط اعلام می‌کنم که وجود داره
  throw new Error('clearUserState is not implemented');
}

module.exports = { askAI, setUserState, clearUserState };