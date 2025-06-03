// نسخه کامل و تمیز - همه نیازهای مطرح‌شده
const { ref, get, update } = require("firebase/database");

// رنک و ساب رنک‌ها
const rankStages = [
  "Warrior", "Elite", "Master", "Grandmaster",
  "Epic", "Legend", "Mythic", "Mythical Honor", "Glorious Mythic", "Immortal"
];
const subRanks = {
  Warrior: ["III", "II", "I"],
  Elite: ["III", "II", "I"],
  Master: ["III", "II", "I"],
  Grandmaster: ["III", "II", "I"],
  Epic: ["IV", "III", "II", "I"],
  Legend: ["IV", "III", "II", "I"],
  Mythic: [],
  "Mythical Honor": [],
  "Glorious Mythic": [],
  Immortal: []
};
const starsPerRank = {
  default: 5,
  Epic: 5,
  Legend: 5,
  Mythic: 24, // 1 تا 24
  "Mythical Honor": 25, // 25 تا 49
  "Glorious Mythic": 50, // 50 تا 99
  Immortal: null // دستی وارد میشه
};
const mythicBreaks = {
  Mythic: { min: 1, max: 24 },
  "Mythical Honor": { min: 25, max: 49 },
  "Glorious Mythic": { min: 50, max: 99 }
};

const userRankState = {};
const userCooldowns = {};

function userRef(userId) {
  return ref(db, `users/${userId}`);
}
async function getUser(userId) {
  const snap = await get(userRef(userId));
  return snap.exists() ? snap.val() : null;
}

// -- بستن پنجره شیشه‌ای --
function closeInline(bot, query) {
  if (query && query.message)
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    }).catch(() => {});
}

// -- مدیریت اسپم دکمه --
function checkSpam(userId, callbackQuery, bot) {
  if (userCooldowns[userId] && userCooldowns[userId] > Date.now()) {
    bot.answerCallbackQuery(callbackQuery.id, { text: "⛔️ به دلیل اسپم تا ۱ دقیقه نمی‌توانید استفاده کنید.", show_alert: true });
    return true;
  }
  if (userCooldowns[userId] && Date.now() - userCooldowns[userId] < 1000) {
    userCooldowns[userId] = Date.now() + 60000;
    bot.answerCallbackQuery(callbackQuery.id, { text: "⛔️ اسپم دکمه! تا ۱ دقیقه نمی‌توانید استفاده کنید.", show_alert: true });
    return true;
  }
  userCooldowns[userId] = Date.now();
  return false;
}

// -- UI --
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
  });
}
function sendRankSelection(bot, chatId, step = "start") {
  const rows = [];
  for (let i = 0; i < rankStages.length; i += 2) {
    const row = [
      {
        text: rankStages[i],
        callback_data: `rank_stage_${rankStages[i].replace(/ /g, "_")}`
      }
    ];
    if (rankStages[i + 1]) {
      row.push({
        text: rankStages[i + 1],
        callback_data: `rank_stage_${rankStages[i + 1].replace(/ /g, "_")}`
      });
    }
    rows.push(row);
  }
  bot.sendMessage(
    chatId,
    step === "start" ? "👑 رنک فعلی خود را انتخاب کنید:" : "🎯 رنک هدف خود را انتخاب کنید:",
    { reply_markup: { inline_keyboard: rows } }
  );
}
function sendSubRanks(bot, chatId, rank) {
  const subs = subRanks[rank] || [];
  if (!subs.length) {
    if (!userRankState[chatId].currentSub) {
      userRankState[chatId].currentSub = null;
    } else {
      userRankState[chatId].targetSub = null;
    }
    return sendStarSelection(bot, chatId, rank);
  }
  const buttons = subs.map(s => [
    { text: s, callback_data: `rank_sub_${s}` }
  ]);
  bot.sendMessage(chatId, `🎖 رنک ${rank} را دقیق‌تر مشخص کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}
function sendStarSelection(bot, chatId, rank) {
  if (rank === "Immortal") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های رنک ایمورتال را وارد کنید (مثلاً 12):");
    userRankState[chatId].awaitingImmortalInput = true;
    return;
  }
  if (rank === "Mythic") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های Mythic خود را بین 1 تا 24 وارد کنید:");
    userRankState[chatId].awaitingMythicInput = "current";
    return;
  }
  if (rank === "Mythical Honor") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های Mythical Honor خود را بین 25 تا 49 وارد کنید:");
    userRankState[chatId].awaitingMythicInput = "current";
    return;
  }
  if (rank === "Glorious Mythic") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های Glorious Mythic خود را بین 50 تا 99 وارد کنید:");
    userRankState[chatId].awaitingMythicInput = "current";
    return;
  }
  const maxStars = starsPerRank[rank] || starsPerRank.default;
  const buttons = [];
  for (let i = 1; i <= maxStars; i++) {
    buttons.push([{ text: `${i}⭐`, callback_data: `rank_star_${i}` }]);
  }
  bot.sendMessage(chatId, `⭐️ تعداد ستاره‌های ${rank} خود را انتخاب کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}
function sendWinrateSelection(bot, chatId) {
  const options = [40, 50, 60, 70, 80, 90, 100];
  const buttons = options.map(p => [
    { text: `${p}% وین ریت`, callback_data: `rank_winrate_${p}` }
  ]);
  bot.sendMessage(chatId, "🎯 وین‌ریت دلخواه خود را انتخاب کنید:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

// -- الگوریتم شمارش ستاره --
function getAbsoluteStarIndex(rank, sub, star) {
  // Mythic به بالا
  if (rank === "Mythic") return star;
  if (rank === "Mythical Honor") return 24 + star;
  if (rank === "Glorious Mythic") return 49 + star;
  if (rank === "Immortal") return star; // دستی

  // Warrior تا Legend
  let total = 0;
  for (let rk of rankStages) {
    if (rk === "Mythic") break;
    let subRanksList = subRanks[rk] || [null];
    for (let sr of subRanksList) {
      let end = (rk === rank && sr === sub) ? star : starsPerRank.default;
      total += end;
      if (rk === rank && sr === sub) return total;
    }
  }
  return total;
}
function getStarDistance(startRank, startSub, startStar, endRank, endSub, endStar) {
  let startIdx = getAbsoluteStarIndex(startRank, startSub, startStar);
  let endIdx = getAbsoluteStarIndex(endRank, endSub, endStar);
  return endIdx - startIdx;
}
function calculateWinsNeeded(stars, winrate) {
  const wr = winrate / 100;
  const gamesNeeded = Math.ceil(stars / wr);
  return { neededStars: stars, gamesNeeded };
}

// -- finalize و کم کردن امتیاز --
async function finalizeRankCalc(bot, userId, isCustom, adminOptions = {}) {
  const state = userRankState[userId];
  const {
    currentStage, currentSub, currentStars,
    targetStage, targetSub, targetStars, winrate
  } = state;
  // شمارش ستاره دقیق
  const cs = getAbsoluteStarIndex(currentStage, currentSub, currentStars);
  const ts = getAbsoluteStarIndex(targetStage, targetSub, targetStars);
  if (ts <= cs) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد.");
  }
  const wr = winrate || 50;
  const result = calculateWinsNeeded(ts - cs, wr);
  const daysNormal = Math.ceil(result.gamesNeeded / 5);
  const daysPerfect = Math.ceil(result.neededStars / 5);

  // مدیریت حالت عملیات ویژه مدیر
  let skipPoint = false;
  if (adminOptions && adminOptions.noPoint) skipPoint = true;

  // کم کردن امتیاز
  let msgPoint = "";
  if (!skipPoint) {
    const user = await getUser(userId);
    if (!user || (user.points || 0) < 1) {
      delete userRankState[userId];
      return bot.sendMessage(userId, "❌ امتیاز کافی برای استفاده از این قابلیت ندارید.");
    }
    await update(userRef(userId), { points: (user.points || 0) - 1 });
    msgPoint = "\n✅ یک امتیاز از حساب شما کسر شد.";
  }

  const msg = `📊 نتیجه محاسبه:
✅ فاصله تا رنک هدف: ${result.neededStars} ستاره
🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${result.gamesNeeded} بازی
🕐 اگر روزانه ۵ بازی با وین‌ریت ${wr}% انجام دهید: حدود ${daysNormal} روز
🟢 اگر هر روز ۵ برد کامل داشته باشید (وین‌ریت ۱۰۰٪): حدود ${daysPerfect} روز${msgPoint}`;
  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

// -- هندل انتخاب رنک و دکمه‌ها --
async function handleRankCallback(bot, userId, data, callbackQuery, adminOptions = {}) {
  // اسپم و میوت
  if (checkSpam(userId, callbackQuery, bot)) return;
  // بستن کیبورد قبلی
  closeInline(bot, callbackQuery);

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
      sendSubRanks(bot, userId, rank);
    } else if (!state.targetStage) {
      state.targetStage = rank;
      state.step = "targetSub";
      sendSubRanks(bot, userId, rank);
    }
    return;
  }

  if (data.startsWith("rank_sub_")) {
    const sub = data.replace("rank_sub_", "");
    if (!state.currentSub) {
      state.currentSub = sub;
      state.step = "currentStars";
      sendStarSelection(bot, userId, state.currentStage);
    } else if (!state.targetSub) {
      state.targetSub = sub;
      state.step = "targetStars";
      sendStarSelection(bot, userId, state.targetStage);
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
        finalizeRankCalc(bot, userId, false, adminOptions);
      }
    }
    return;
  }

  if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    await finalizeRankCalc(bot, userId, true, adminOptions);
    return;
  }
}

// -- هندل پیام متنی برای Mythic و Immortal --
function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state) return;

  // ایمورتال
  if (state.awaitingImmortalInput) {
    const value = parseInt(msg.text);
    if (isNaN(value) || value < 1 || value > 999) {
      return bot.sendMessage(chatId, "❌ لطفاً یک عدد معتبر وارد کنید (مثلاً 12).");
    }
    delete state.awaitingImmortalInput;
    if (!state.currentStars) {
      state.currentStars = value;
      state.step = "targetRank";
      sendRankSelection(bot, chatId, "target");
    } else if (!state.targetStars) {
      state.targetStars = value;
      if (state.type === "custom") {
        sendWinrateSelection(bot, chatId);
      } else {
        finalizeRankCalc(bot, chatId, false);
      }
    }
    return;
  }

  // Mythic/Honor/Glorious
  if (state.awaitingMythicInput) {
    const value = parseInt(msg.text);
    // تعیین بازه مجاز بر اساس مرحله
    let valid = false;
    if (state.step === "currentStars" || state.step === "currentRank") {
      if (state.currentStage === "Mythic" && value >= 1 && value <= 24) valid = true;
      if (state.currentStage === "Mythical Honor" && value >= 25 && value <= 49) valid = true;
      if (state.currentStage === "Glorious Mythic" && value >= 50 && value <= 99) valid = true;
    } else {
      if (state.targetStage === "Mythic" && value >= 1 && value <= 24) valid = true;
      if (state.targetStage === "Mythical Honor" && value >= 25 && value <= 49) valid = true;
      if (state.targetStage === "Glorious Mythic" && value >= 50 && value <= 99) valid = true;
    }
    if (!valid) {
      return bot.sendMessage(chatId, "❌ عدد وارد شده در بازه مجاز نیست.");
    }
    delete state.awaitingMythicInput;
    if (!state.currentStars) {
      state.currentStars = value;
      state.step = "targetRank";
      sendRankSelection(bot, chatId, "target");
    } else if (!state.targetStars) {
      state.targetStars = value;
      if (state.type === "custom") {
        sendWinrateSelection(bot, chatId);
      } else {
        finalizeRankCalc(bot, chatId, false);
      }
    }
    return;
  }
}

// -- خروجی ماژول --
module.exports = {
  sendRankTypeSelection,
  handleRankCallback,
  handleTextMessage
};