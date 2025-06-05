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
    return res.data.text || 'پاسخی دریافت نشد!';
  } catch (err) {
    console.error('AI error:', err.response?.data || err.message);
    return '❌ مشکلی در ارتباط با هوش مصنوعی رخ داد.';
  }
}

module.exports = { askAI };