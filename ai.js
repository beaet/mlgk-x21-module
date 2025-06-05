const { ref, get, set } = require('firebase/database');
const db = global.db;

async function askAI(userId, message) {
  try {
    const historyRef = ref(db, `chat_history/${userId}`);
    const snapshot = await get(historyRef);
    let history = snapshot.exists() ? snapshot.val() : [];

    history.push(`User: ${message}`);
    const prompt = history.join('\n') + '\nAssistant:';

    // فرض بر این که cohere قبلا init شده
    const response = await cohere.generate({
      model: 'command-xlarge-nightly',
      prompt,
      max_tokens: 150,
      temperature: 0.7,
      stop_sequences: ['User:', 'Assistant:'],
    });

    const reply = response.body.generations[0].text.trim();
    history.push(`Assistant: ${reply}`);

    await set(historyRef, history);
    return reply;
  } catch (error) {
    console.error('Error in askAI:', error);
    return 'خطایی رخ داد، لطفا دوباره تلاش کنید.';
  }
}

module.exports = { askAI };