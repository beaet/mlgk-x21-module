const axios = require('axios');
require('dotenv').config();

async function askAI(question) {
  try {
    const response = await axios.post(
      'https://api.cohere.ai/v1/chat',
      {
        model: 'command-r-plus',
        message: question,
        chat_history: [],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.COHERE_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data.text;
  } catch (error) {
    console.error('AI Error:', error.response?.data || error.message);
    return '❌ مشکلی در ارتباط با هوش مصنوعی پیش آمد.';
  }
}

module.exports = { askAI };