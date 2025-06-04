// rank.js

const userRankState = {};
const userInlineMessages = {};

const allRanks = [
  { name: "Warrior", sub: ["III", "II", "I"], stars: 5 },
  { name: "Elite", sub: ["III", "II", "I"], stars: 5 },
  { name: "Master", sub: ["III", "II", "I"], stars: 5 },
  { name: "Grandmaster", sub: ["III", "II", "I"], stars: 5 },
  { name: "Epic", sub: ["IV", "III", "II", "I"], stars: 5 },
  { name: "Legend", sub: ["IV", "III", "II", "I"], stars: 5 },
  { name: "Mythic", sub: [], stars: 24 },
  { name: "Mythical Honor", sub: [], stars: 25 }, // فقط برای نشانه‌گذاری
  { name: "Glorious Mythic", sub: [], stars: 50 }, // فقط برای نشانه‌گذاری
  { name: "Immortal", sub: [], stars: null }
];

// ذخیره پیام دکمه‌دار برای حذف بعدی
function saveInlineMsg(userId, messageId) {
  if (!userInlineMessages[userId]) userInlineMessages[userId] = [];
  if (!userInlineMessages[userId].includes(messageId))
    userInlineMessages[userId].push(messageId);
}

// بستن همه دکمه‌های یک کاربر
function closeAllInline(bot, userId) {
  if (userInlineMessages[userId]) {
    userInlineMessages[userId].forEach(messageId => {
      bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
        chat_id: userId,
        message_id: messageId
      }).catch(() => {});
    });
    userInlineMessages[userId] = [];
  }
}

// ساخت لیست خطی همه حالت‌های رنک+ساب+ستاره
function getAllRankStates() {
  let list = [];
  for (const rank of allRanks) {
    if (rank.sub.length) {
      for (let sub of rank.sub)
        for (let star = 1; star <= rank.stars; star++)
          list.push({ rank: rank.name, sub, star });
    } else if (rank.name === "Mythic") {
      for (let star = 1; star <= 24; star++)
        list.push({ rank: "Mythic", sub: null, star });
    } else if (rank.name === "Mythical Honor") {
      for (let star = 25; star <= 49; star++)
        list.push({ rank: "Mythical Honor", sub: null, star });
    } else if (rank.name === "Glorious Mythic") {
      for (let star = 50; star <= 99; star++)
        list.push({ rank: "Glorious Mythic", sub: null, star });
    } else if (rank.name === "Immortal") {
      for (let star = 1; star <= 999; star++)
        list.push({ rank: "Immortal", sub: null, star });
    }
  }
  return list;
}

function findIndexInRankList(list, rank, sub, star) {
  return list.findIndex(
    item => item.rank === rank && (item.sub === sub || (!item.sub && !sub)) && item.star === star
  );
}

function getAccurateStarDiff(startRank, startSub, startStar, endRank, endSub, endStar) {
  const states = getAllRankStates();
  const fromIdx = findIndexInRankList(states, startRank, startSub, startStar);
  const toIdx = findIndexInRankList(states, endRank, endSub, endStar);
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return null;
  return toIdx - fromIdx;
}

// ==== دکمه‌های مرحله به مرحله ====

function sendRankTypeSelection(bot, chatId) {
  userRankState[chatId] = {};
  bot.sendMessage(chatId, "🔢 نوع محاسبه مورد نظر را انتخاب کنید:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🧮 محاسبه کلی", callback_data: "rank_calc_basic" },
          { text: "🎯 محاسبه با وین‌ریت", callback_data: "rank_calc_customwin" }
        ]
      ]
    }
  }).then(sent => saveInlineMsg(chatId, sent.message_id));
}
function sendRankSelection(bot, chatId, step = "start") {
  const state = userRankState[chatId] || {};
  // شرط حیاتی برای عدم تکرار دکمه
  if ((step === "start" && state.currentStage) || (step === "target" && state.targetStage)) return;

  const rows = [];
  for (let i = 0; i < allRanks.length; i += 2) {
    const row = [
      {
        text: allRanks[i].name,
        callback_data: `rank_stage_${allRanks[i].name.replace(/ /g, "_")}`
      }
    ];
    if (allRanks[i + 1]) {
      row.push({
        text: allRanks[i + 1].name,
        callback_data: `rank_stage_${allRanks[i + 1].name.replace(/ /g, "_")}`
      });
    }
    rows.push(row);
  }
  bot.sendMessage(
    chatId,
    step === "start" ? "👑 رنک فعلی خود را انتخاب کنید:" : "🎯 رنک هدف خود را انتخاب کنید:",
    { reply_markup: { inline_keyboard: rows } }
  ).then(sent => saveInlineMsg(chatId, sent.message_id));
}

function sendSubRanks(bot, chatId, rank, step = "current") {
  const state = userRankState[chatId] || {};
  // شرط حیاتی برای عدم تکرار دکمه
  if ((step === "current" && state.currentSub) || (step === "target" && state.targetSub)) return;

  const found = allRanks.find(r => r.name === rank);
  const subs = found ? found.sub : [];
  if (!subs.length) {
    if (step === "current") state.currentSub = null;
    else state.targetSub = null;
    return sendStarSelection(bot, chatId, rank, step);
  }
  const buttons = subs.map(s => [{ text: s, callback_data: `rank_sub_${s}` }]);
  bot.sendMessage(chatId, `🎖 رنک ${rank} را دقیق‌تر مشخص کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  }).then(sent => saveInlineMsg(chatId, sent.message_id));
}

function sendStarSelection(bot, chatId, rank, step = "current") {
  const state = userRankState[chatId] || {};
  // شرط حیاتی برای عدم تکرار دکمه
  if ((step === "current" && state.currentStars) || (step === "target" && state.targetStars)) return;

  const found = allRanks.find(r => r.name === rank);
  let minStars = 1, maxStars = (found && found.stars) ? found.stars : 5;
  if (rank === "Immortal") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های رنک Immortal را وارد کنید (مثلاً 12):")
      .then(sent => saveInlineMsg(chatId, sent.message_id));
    userRankState[chatId][step === "current" ? "awaitingImmortalInput" : "awaitingImmortalTarget"] = true;
    return;
  }
  if (rank === "Mythic") { minStars = 1; maxStars = 24; }
  if (rank === "Mythical Honor") { minStars = 25; maxStars = 49; }
  if (rank === "Glorious Mythic") { minStars = 50; maxStars = 99; }

  const buttons = [];
  let row = [];
  for (let i = minStars; i <= maxStars; i++) {
    row.push({ text: `${i}⭐`, callback_data: `rank_star_${i}` });
    if (row.length === 5 || i === maxStars) {
      buttons.push(row);
      row = [];
    }
  }
  bot.sendMessage(chatId, `⭐️ تعداد ستاره‌های ${rank} خود را انتخاب کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  }).then(sent => saveInlineMsg(chatId, sent.message_id));
}

function sendWinrateSelection(bot, chatId) {
  const state = userRankState[chatId] || {};
  if (state.winrate) return;
  const options = [40, 50, 60, 70, 80, 90, 100];
  const buttons = [];
  for (let i = 0; i < options.length; i += 2) {
    const row = [
      { text: `${options[i]}% وین ریت`, callback_data: `rank_winrate_${options[i]}` }
    ];
    if (options[i + 1]) row.push({ text: `${options[i + 1]}% وین ریت`, callback_data: `rank_winrate_${options[i + 1]}` });
    buttons.push(row);
  }
  bot.sendMessage(chatId, "🎯 وین‌ریت دلخواه خود را انتخاب کنید:", {
    reply_markup: { inline_keyboard: buttons }
  }).then(sent => saveInlineMsg(chatId, sent.message_id));
}

// اعلام نتیجه و بستن همه دکمه‌ها
function finalizeRankCalc(bot, userId, isCustom, replyToMessageId) {
  const state = userRankState[userId];
  const {
    currentStage, currentSub, currentStars,
    targetStage, targetSub, targetStars, winrate
  } = state;

  const starDiff = getAccurateStarDiff(
    currentStage, currentSub, currentStars,
    targetStage, targetSub, targetStars
  );

  if (starDiff === null) {
    closeAllInline(bot, userId);
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد یا مقدار ورودی اشتباه است.");
  }

  const wr = winrate || 50;
  const gamesNeeded = Math.ceil(starDiff / (wr / 100));
  const daysNormal = Math.ceil(gamesNeeded / 5);
  const daysPerfect = Math.ceil(starDiff / 5);

  const msg = `📊 نتیجه محاسبه:
✅ فاصله تا رنک هدف: ${starDiff} ستاره
🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${gamesNeeded} بازی
🕐 اگر روزانه ۵ بازی با وین‌ریت ${wr}% انجام دهید: حدود ${daysNormal} روز
🟢 اگر هر روز ۵ برد کامل داشته باشید (وین‌ریت ۱۰۰٪): حدود ${daysPerfect} روز`;

  closeAllInline(bot, userId);
  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

// ==== هندل دکمه‌ها ====

function handleRankCallback(bot, userId, data, callbackQuery, replyToMessageId) {
  if (!userRankState[userId]) userRankState[userId] = {};
  const state = userRankState[userId];

  if (data === "rank_calc_basic" || data === "rank_calc_customwin") {
    state.type = data === "rank_calc_customwin" ? "custom" : "basic";
    state.step = "currentRank";
    sendRankSelection(bot, userId, "start");
    return;
  }

  if (data.startsWith("rank_stage_")) {
    const rank = data.replace("rank_stage_", "").replace(/_/g, " ");
    if (!state.currentStage) {
      state.currentStage = rank;
      state.step = "currentSub";
      sendSubRanks(bot, userId, rank, "current");
    } else if (!state.targetStage) {
      state.targetStage = rank;
      state.step = "targetSub";
      sendSubRanks(bot, userId, rank, "target");
    }
    return;
  }

  if (data.startsWith("rank_sub_")) {
    const sub = data.replace("rank_sub_", "");
    if (!state.currentSub) {
      state.currentSub = sub;
      state.step = "currentStars";
      sendStarSelection(bot, userId, state.currentStage, "current");
    } else if (!state.targetSub) {
      state.targetSub = sub;
      state.step = "targetStars";
      sendStarSelection(bot, userId, state.targetStage, "target");
    }
    return;
  }

  if (data.startsWith("rank_star_")) {
    const star = parseInt(data.replace("rank_star_", ""));
    if (!state.currentStars) {
      state.currentStars = star;
      state.step = "targetRank";
      sendRankSelection(bot, userId, "target");
    } else if (!state.targetStars) {
      state.targetStars = star;
      if (state.type === "custom") {
        sendWinrateSelection(bot, userId);
      } else {
        finalizeRankCalc(bot, userId, false, replyToMessageId);
      }
    }
    return;
  }

  if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    finalizeRankCalc(bot, userId, true, replyToMessageId);
    return;
  }
}

// پیام متنی (برای Immortal)
function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state) return;

  if (state.awaitingImmortalInput) {
    const value = parseInt(msg.text);
    if (isNaN(value) || value < 1 || value > 999) {
      return bot.sendMessage(chatId, "❌ لطفاً یک عدد معتبر بین 1 تا 999 وارد کنید (مثلاً 12).");
    }
    delete state.awaitingImmortalInput;
    if (!state.currentStars) {
      state.currentStars = value;
      state.step = "targetRank";
      sendRankSelection(bot, chatId, "target");
    } else {
      state.targetStars = value;
      if (state.type === "custom") {
        sendWinrateSelection(bot, chatId);
      } else {
        finalizeRankCalc(bot, chatId, false, msg.message_id);
      }
    }
    return;
  }
  if (state.awaitingImmortalTarget) {
    const value = parseInt(msg.text);
    if (isNaN(value) || value < 1 || value > 999) {
      return bot.sendMessage(chatId, "❌ لطفاً یک عدد معتبر بین 1 تا 999 وارد کنید (مثلاً 12).");
    }
    delete state.awaitingImmortalTarget;
    state.targetStars = value;
    if (state.type === "custom") {
      sendWinrateSelection(bot, chatId);
    } else {
      finalizeRankCalc(bot, chatId, false, msg.message_id);
    }
    return;
  }
}

module.exports = {
  userRankState,
  sendRankTypeSelection,
  handleRankCallback,
  handleTextMessage
};