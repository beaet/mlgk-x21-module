const Parser = require('rss-parser');
const parser = new Parser();

async function sendNews(bot, userId) {
  try {
    const feed = await parser.parseURL('https://www.reddit.com/r/MobileLegendsGame/.rss');
    const news = feed.items.slice(0, 5); // فقط ۵ خبر اول

    if (news.length === 0) {
      await bot.sendMessage(userId, '❌ خبری برای نمایش وجود ندارد.');
      return;
    }

    let message = '📰 آخرین اخبار Mobile Legends:\n\n';
    news.forEach((item) => {
      message += `🔹 ${item.title}\n${item.link}\n\n`;
    });

    await bot.sendMessage(userId, message);
  } catch (err) {
    console.error('خطا در دریافت RSS:', err.message);
    await bot.sendMessage(userId, '❌ خطا در دریافت اخبار. لطفاً بعداً امتحان کنید.');
  }
}

module.exports = { sendNews };