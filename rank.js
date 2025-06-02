const fs = require("fs");
const { ref, get, update } = require("firebase/database");

// ساختار کامل رنک‌ها و زیررنک‌ها
const rankList = [
  { name: 'Warrior', subs: ['III', 'II', 'I'], starsPerSub: 3 },
  { name: 'Elite', subs: ['III', 'II', 'I'], starsPerSub: 4 },
  { name: 'Master', subs: ['III', 'II', 'I'], starsPerSub: 5 },
  { name: 'Grandmaster', subs: ['III', 'II', 'I'], starsPerSub: 5 },
  { name: 'Epic', subs: ['IV', 'III', 'II', 'I'], starsPerSub: 5 },
  { name: 'Legend', subs: ['IV', 'III', 'II', 'I'], starsPerSub: 5 },
  { name: 'Mythic', subs: [], starsPerSub: 25 },
  { name: 'Mythical Honor', subs: [], starsPerSub: 25 },
  { name: 'Glorious Mythic', subs: [], starsPerSub: 50 },
  { name: 'Immortal', subs: [], starsPerSub: null }, // وارد کردن دستی
];

const userRankState = {};

const userRef = (userId) => ref(db, `users/${userId}`);

async function getUser(userId) {
  const snap = await get(userRef(userId));
  return snap.exists() ? snap.val() : null;
}

function sendRankTypeSelection(bot, chatId) {
  userRankState[chatId] = {};
  bot.sendMessage(chatId, "🔢 نوع محاسبه را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🧮 محاسبه ساده", callback_data: "rank_calc_basic" },
          { text: "🎯 محاسبه با وین‌ریت", callback_data: "rank_calc_customwin" },
        ]
      ]
    }
  });
}

function sendRankSelection(bot, chatId, step) {
  const buttons = rankList.map(rank => [{ text: rank.name, callback_data: `rank_select_${step}_${rank.name.replace(/ /g, "_")}` }]);
  bot.sendMessage(chatId, step === 'current' ? "👑 رنک فعلی را انتخاب کن:" : "🎯 رنک هدف را انتخاب کن:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

function sendSubRankSelection(bot, chatId, rankName, step) {
  const rank = rankList.find(r => r.name === rankName);
  if (!rank || rank.subs.length === 0) {
    sendStarSelection(bot, chatId, rankName, null, step);
    return;
  }

  const buttons = rank.subs.map(sub => [{ text: sub, callback_data: `rank_sub_${step}_${sub}` }]);
  bot.sendMessage(chatId, `🎖 زیررنک ${rankName} را انتخاب کن:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

function sendStarSelection(bot, chatId, rankName, subRank, step) {
  const rank = rankList.find(r => r.name === rankName);
  if (!rank) return;

  const starCount = rank.starsPerSub || 25;
  if (rank.name === 'Immortal') {
    userRankState[chatId].step = step;
    userRankState[chatId].awaitingImmortalInput = true;
    return bot.sendMessage(chatId, "🔢 تعداد ستاره‌های رنک ایمورتال را وارد کن (مثلاً 12):");
  }

  const buttons = [];
  for (let i = 1; i <= starCount; i++) {
    buttons.push([{ text: `${i}⭐`, callback_data: `rank_star_${step}_${i}` }]);
  }

  bot.sendMessage(chatId, `⭐ تعداد ستاره ${rankName}${subRank ? ' ' + subRank : ''} را انتخاب کن:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

function calculateTotalStars(rankName, sub, star) {
  let total = 0;
  for (const rank of rankList) {
    if (rank.name === rankName) {
      if (rank.subs.length) {
        const subIndex = rank.subs.indexOf(sub);
        total += (rank.subs.length - subIndex - 1) * rank.starsPerSub;
      }
      total += star;
      break;
    } else {
      total += rank.subs.length
        ? rank.subs.length * rank.starsPerSub
        : rank.starsPerSub;
    }
  }
  return total;
}

async function finalizeRankCalc(bot, userId) {
  const state = userRankState[userId];
  const { current, target, winrate = 50 } = state;

  const currentStars = calculateTotalStars(current.rank, current.sub, current.star);
  const targetStars = calculateTotalStars(target.rank, target.sub, target.star);

  const starsNeeded = targetStars - currentStars;
  if (starsNeeded <= 0) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشه.");
  }

  const user = await getUser(userId);
  if (!user || (user.points || 0) < 1) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "❌ امتیاز کافی نداری.");
  }

  const gamesNeeded = Math.ceil(starsNeeded / (winrate / 100));
  await update(userRef(userId), { points: user.points - 1 });

  bot.sendMessage(userId, `📊 نتیجه:

✅ فاصله تا رنک هدف: ${starsNeeded} ستاره  
🎯 تعداد بازی مورد نیاز (وین‌ریت ${winrate}%): ${gamesNeeded} بازی  
🕐 با ۵ بازی روزانه: حدود ${Math.ceil(gamesNeeded / 5)} روز

(۱ امتیاز بابت این محاسبه از حساب شما کم شد)`);

  delete userRankState[userId];
}

function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state?.awaitingImmortalInput) return;

  const stars = parseInt(msg.text.trim());
  if (isNaN(stars) || stars <= 0) {
    return bot.sendMessage(chatId, "لطفاً یه عدد معتبر وارد کن (مثلاً 10)");
  }

  const step = state.step;
  delete state.awaitingImmortalInput;
  if (step === 'current') {
    state.current = { ...state.current, star: stars };
    sendRankSelection(bot, chatId, 'target');
  } else {
    state.target = { ...state.target, star: stars };
    if (state.type === 'custom') {
      sendWinrateSelection(bot, chatId);
    } else {
      finalizeRankCalc(bot, chatId);
    }
  }
}

function handleRankCallback(bot, userId, data) {
  const state = userRankState[userId] ||= {};

  if (data === "rank_calc_basic") {
    state.type = "basic";
    sendRankSelection(bot, userId, "current");

  } else if (data === "rank_calc_customwin") {
    state.type = "custom";
    sendRankSelection(bot, userId, "current");

  } else if (data.startsWith("rank_select_")) {
    const [, step, rankRaw] = data.split("_");
    const rank = rankRaw.replace(/_/g, " ");
    if (!state[step]) state[step] = {};
    state[step].rank = rank;
    sendSubRankSelection(bot, userId, rank, step);

  } else if (data.startsWith("rank_sub_")) {
    const [, step, sub] = data.split("_");
    if (!state[step]) state[step] = {};
    state[step].sub = sub;
    sendStarSelection(bot, userId, state[step].rank, sub, step);

  } else if (data.startsWith("rank_star_")) {
    const [, step, starStr] = data.split("_");
    const star = parseInt(starStr);
    if (!state[step]) state[step] = {};
    state[step].star = star;

    if (step === "current") {
      sendRankSelection(bot, userId, "target");
    } else if (state.type === "custom") {
      sendWinrateSelection(bot, userId);
    } else {
      finalizeRankCalc(bot, userId);
    }

  } else if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    finalizeRankCalc(bot, userId);
  }
}

module.exports = {
  sendRankTypeSelection,
  handleRankCallback,
  handleTextMessage,
};