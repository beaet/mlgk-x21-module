// rank.js

const userRankState = {}; // وضعیت هر کاربر برای روند محاسبه
const userInlineMessages = {}; // پیام‌های دکمه‌دار هر کاربر

// آنتی اسپم فقط برای کال‌بک‌های رنک (۲ ثانیه، بالای ۵ کلیک سریع)
const rankSpamMap = {}; // userId => [timestamps]
function rankAntispam(userId, callbackQuery, bot) {
  if (!rankSpamMap[userId]) rankSpamMap[userId] = [];
  const now = Date.now();
  // فقط ۲ ثانیه اخیر رو نگه دار
  rankSpamMap[userId] = rankSpamMap[userId].filter(ts => now - ts < 2000);
  rankSpamMap[userId].push(now);
  // اگر توی ۲ ثانیه بیشتر از ۵ بار زد، اسپم حساب کن
  if (rankSpamMap[userId].length > 5) {
    if (callbackQuery && callbackQuery.id)
      bot.answerCallbackQuery(callbackQuery.id, { text: "⏳ لطفاً کمی صبر کنید...", show_alert: false });
    return true;
  }
  return false;
}

const allRanks = [
  { name: "Warrior", sub: ["III", "II", "I"], stars: 5 },
  { name: "Elite", sub: ["III", "II", "I"], stars: 5 },
  { name: "Master", sub: ["III", "II", "I"], stars: 5 },
  { name: "Grandmaster", sub: ["III", "II", "I"], stars: 5 },
  { name: "Epic", sub: ["IV", "III", "II", "I"], stars: 5 },
  { name: "Legend", sub: ["IV", "III", "II", "I"], stars: 5 },
  { name: "Mythic", sub: [], stars: 24 },
  { name: "Mythical Honor", sub: [], stars: 25 },
  { name: "Glorious Mythic", sub: [], stars: 50 },
  { name: "Immortal", sub: [], stars: null }
];

// ذخیره پیام دکمه‌دار برای بستن همگانی
function saveInlineMsg(userId, messageId) {
  if (!userInlineMessages[userId]) userInlineMessages[userId] = [];
  if (!userInlineMessages[userId].includes(messageId))
    userInlineMessages[userId].push(messageId);
}

// بستن همه دکمه‌های شیشه‌ای کاربر (پس از اتمام محاسبه)
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

// آرایه خطی همه حالات رنک+ساب+ستاره (برای محاسبه دقیق فاصله)
function getAllRankStates() {
  let list = [];
  for (const rank of allRanks) {
    if (rank.sub.length) {
      for (let subIdx = 0; subIdx < rank.sub.length; subIdx++) {
        const sub = rank.sub[subIdx];
        for (let star = 1; star <= rank.stars; star++) {
          list.push({ rank: rank.name, sub, star });
        }
      }
    } else if (rank.stars) {
      let min = 1, max = rank.stars;
      if (rank.name === "Mythical Honor") min = 25;
      if (rank.name === "Glorious Mythic") min = 50;
      for (let star = min; star <= max; star++) {
        list.push({ rank: rank.name, sub: null, star });
      }
    } else if (rank.name === "Immortal") {
      for (let star = 1; star <= 999; star++) {
        list.push({ rank: rank.name, sub: null, star });
      }
    }
  }
  return list;
}

function findIndexInRankList(list, rank, sub, star) {
  return list.findIndex(
    item =>
      item.rank === rank &&
      (item.sub === sub || (!item.sub && !sub)) &&
      item.star === star
  );
}

function getAccurateStarDiff(startRank, startSub, startStar, endRank, endSub, endStar) {
  const states = getAllRankStates();
  const fromIdx = findIndexInRankList(states, startRank, startSub, startStar);
  const toIdx = findIndexInRankList(states, endRank, endSub, endStar);
  if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) return null;
  return toIdx - fromIdx;
}

// دکمه انتخاب نوع محاسبه
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

// دکمه انتخاب رنک
function sendRankSelection(bot, chatId, step = "start") {
  const state = userRankState[chatId];
  // اگر این مرحله قبلاً پر شده، دوباره سوال نپرس
  if ((step === "start" && state.currentStage) || (step !== "start" && state.targetStage)) return;
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
        text: allRanks[i + , "_")}`
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

// دکمه انتخاب ساب رنک (درصورت داشتن)
function sendSubRanks(bot, chatId, rank, target = false) {
  const state = userRankState[chatId];
  // اگر این مرحله قبلاً پر شده، دوباره سوال نپرس
  if ((target && state.targetSub) || (!target && state.currentSub)) return;
  const found = allRanks.find(r => r.name === rank);
  const subs = found ? found.sub : [];
  if (!subs.length) {
    if (!target) state.currentSub = null;
    else state.targetSub = null;
    return sendStarSelection(bot, chatId, rank, target ? "target" : "current");
  }
  const buttons = subs.map(s => [{ text: s, callback_data: `rank_sub_${s}` }]);
  bot.sendMessage(chatId, `🎖 رنک ${rank} را دقیق‌تر مشخص کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  }).then(sent => saveInlineMsg(chatId, sent.message_id));
}

// دکمه انتخاب ستاره (همه رنک‌ها بجز Immortal)
function sendStarSelection(bot, chatId, rank, step = "current") {
  const state = userRankState[chatId];
  // اگر این مرحله قبلاً پر شده، دوباره سوال نپرس
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

// دکمه وین‌ریت
function sendWinrateSelection(bot, chatId) {
  const state = userRankState[chatId];
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
function finalizeRankCalc(bot, userId, isCustom, replyToMessageId, setCooldown) {
  const state = userRankState[userId];
  const {
    currentStage, currentSub, currentStars,
    targetStage, targetSub, target = getAccurateStarDiff(
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
  // فقط اینجا محدودیت رو ثبت کن
  if (setCooldown) setCooldown(userId);
}

// هندل دکمه‌ها (آنتی اسپم فقط اینجاست!)
function handleRankCallback(bot, userId, data, callbackQuery, replyToMessageId, setCooldown) {
  if (rankAntispam(userId, callbackQuery, bot)) return;

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
      sendSubRanks(bot, userId, rank, false);
      return;
    }
    if (!state.targetStage) {
      state.targetStage = rank;
      state.step = "targetSub";
      sendSubRanks(bot, userId, rank, true);
      return;
    }
    // اگر هر دو مقدار بود، کاری نکن
    return;
  }

  if (data.startsWith("rank_sub_")) {
    const sub = data.replace("rank_sub_", "");
    if (!state.currentSub) {
      state.currentSub = sub;
      state.step = "currentStars";
      sendStarSelection(bot, userId, state.currentStage, "current");
      return;
    }
    if (!state.targetSub) {
      state.targetSub = sub;
      state.step = "targetStars";
      sendStarSelection(bot, userId, state.targetStage, "target");
      return;
    }
    return;
  }

  if (data.startsWith("rank_star_")) {
    const star = parseInt(data.replace("rank_star_", ""));
    if (!state.currentStars) {
      state.currentStars = star;
      state.step = "targetRank";
      sendRankSelection(bot, userId, "target");
      return;
    }
    if (!state.targetStars) {
      state.targetStars = star;
      if (state.type === "custom") {
        sendWinrateSelection(bot, userId);
      } else {
        finalizeRankCalc(bot, userId, false, replyToMessageId, setCooldown);
      }
      return;
    }
    return;
  }

  if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    finalizeRankCalc(bot, userId, true, replyToMessageId, setCooldown);
    return;
  }
}

// هندل پیام متنی (برای Immortal)
function handleTextMessage(bot, msg, setCooldown) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state) return;

  // حالت وارد کردن ستاره Immortal فعلی
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
        finalizeRankCalc(bot, chatId, false, msg.message_id, setCooldown);
      }
    }
    return;
  }

  // حالت وارد کردن ستاره Immortal هدف
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
      finalizeRankCalc(bot, chatId, false, msg.message_id, setCooldown);
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