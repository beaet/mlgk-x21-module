const cohere = require('cohere-ai');
const { ref, get, set } = require('firebase/database');
const { db } = require('./firebase');

// کلید API کوهیر رو مستقیم اینجا بذار
const COHERE_API_KEY = 'کلید_تو_اینجا_بذار';

cohere.init(COHERE_API_KEY);

async function askAI(userId, message) {
  try {
    const historyRef = ref(db, `chat_history/${userId}`);

    const snapshot = await get(historyRef);
    let history = [];
    if (snapshot.exists()) {
      history = snapshot.val();
    }

    // اضافه کردن پیام جدید کاربر به تاریخچه
    history.push(`User: ${message}`);

    // آماده کردن متن ورودی برای Cohere
    const prompt = history.join('\n') + '\nAssistant:';

    // درخواست به Cohere
    const response = await cohere.generate({
      model: 'command-xlarge-nightly', // یا هر مدل دلخواهی که داری
      prompt,
      max_tokens: 150,
      temperature: 0.7,
      stop_sequences: ['User:', 'Assistant:'],
    });

    const reply = response.body.generations[0].text.trim();

    // ذخیره پاسخ در تاریخچه
    history.push(`Assistant: ${reply}`);

    await set(historyRef, history);

    return reply;
  } catch (error) {
    console.error('Error in askAI:', error);
    return 'خطایی رخ داد، لطفا دوباره تلاش کنید.';
  }
}

module.exports = { askAI };