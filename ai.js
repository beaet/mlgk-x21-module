const axios = require('axios');

const apiKey = process.env.COHERE_API_KEY;

async function askAI(question) {
  try {
    const res = await axios.post(
      'https://api.cohere.ai/v1/chat',
      { message: question },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    console.log('COHERE RAW RESPONSE:', JSON.stringify(res.data, null, 2)); // <--- این خط را اضافه کن

    // سعی کن همه حالت‌های ممکن خروجی را تست کنی
    if (res.data.text) return res.data.text;
    if (res.data.reply) return res.data.reply;
    if (res.data.generations && res.data.generations[0]?.text)
      return res.data.generations[0].text;
    return 'پاسخی از هوش مصنوعی دریافت نشد!';
  } catch (err) {
    console.error('AI error:', err.response?.data || err.message);
    return '❌ مشکلی در ارتباط با هوش مصنوعی رخ داد.';
  }
}

module.exports = { askAI };