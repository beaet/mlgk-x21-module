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
  // پس اینجا فقط اعلامش کردم که ارور نده ولی تعریف اصلی اینجا نیست
  return;
}

/**
 * پاک کردن وضعیت کاربر از دیتابیس
 * @param {number|string} userId شناسه کاربر
 */
async function clearUserState(userId) {
  // این تابع هم باید تو index.js یا جای مناسب تو پروژه تعریف بشه
  return;
}

module.exports = { askAI, setUserState, clearUserState };