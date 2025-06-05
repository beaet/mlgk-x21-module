const cohere = require('cohere-ai');

const COHERE_API_KEY = process.env.COHERE_API_KEY || 'کلید_تو_اینجا_بذار';
cohere.init(COHERE_API_KEY);

async function askAI(message) {
  try {
    const response = await cohere.generate({
      model: 'command-xlarge-nightly',
      prompt: message,
      max_tokens: 150,
      temperature: 0.7,
      stop_sequences: ['User:', 'Assistant:'],
    });

    return response.body.generations[0].text.trim();
  } catch (error) {
    console.error('Error in askAI:', error);
    return 'خطایی رخ داد، لطفا دوباره تلاش کنید.';
  }
}

module.exports = { askAI };