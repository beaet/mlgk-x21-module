const spamTracker = {};

function checkSpam(userId, query, bot, adminId) {
  const now = Date.now();

  if (userId == adminId) return false;

  if (spamTracker[userId]?.isBanned && now < spamTracker[userId].isBannedUntil) {
    bot.answerCallbackQuery(query.id, {
      text: "⛔ به‌دلیل کلیک زیاد، برای یک دقیقه مسدود شده‌اید.",
      show_alert: true
    });
    return true;
  }

  if (!spamTracker[userId]) {
    spamTracker[userId] = { count: 1, lastClick: now };
  } else {
    const diff = now - spamTracker[userId].lastClick;
    if (diff < 3000) {
      spamTracker[userId].count++;
    } else {
      spamTracker[userId].count = 1;
    }
    spamTracker[userId].lastClick = now;
  }

  if (spamTracker[userId].count >= 6) {
    spamTracker[userId].isBanned = true;
    spamTracker[userId].isBannedUntil = now + 60000;
    bot.answerCallbackQuery(query.id, {
      text: "🚫 اسپم دکمه! تا 1 دقیقه مسدود شدید.",
      show_alert: true
    });
    return true;
  }

  return false;
}

module.exports = { checkSpam };