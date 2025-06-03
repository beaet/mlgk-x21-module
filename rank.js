const { ref, get, set, update } = require("firebase/database");

// ساختار رنک و ستاره
const allRanks = [
  {name: "Warrior", sub: ["III", "II", "I"], stars: 5},
  {name: "Elite", sub: ["III", "II", "I"], stars: 5},
  {name: "Master", sub: ["III", "II", "I"], stars: 5},
  {name: "Grandmaster", sub: ["III", "II", "I"], stars: 5},
  {name: "Epic", sub: ["IV", "III", "II", "I"], stars: 5},
  {name: "Legend", sub: ["IV", "III", "II", "I"], stars: 5},
  {name: "Mythic", sub: [], stars: 24},
  {name: "Mythical Honor", sub: [], stars: 25},
  {name: "Glorious Mythic", sub: [], stars: 50},
  {name: "Immortal", sub: [], stars: null}
];

const userRankState = {};
const userCooldowns = {};

// کمک
function userRef(userId) {
  return ref(db, `users/${userId}`);
}
async function getUser(userId) {
  const snap = await get(userRef(userId));
  return snap.exists() ? snap.val() : null;
}

// بستن دکمه شیشه‌ای
function closeInline(bot, query) {
  if (query && query.message) {
    bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
      chat_id: query.message.chat.id,
      message_id: query.message.message_id
    }).catch(() => {});
  }
}

// اسپم/کول‌داون ۱ دقیقه‌ای (برای هر کاربر)
function checkSpam(userId, callbackQueryOrMessage, bot) {
  const now = Date.now();

  if (userCooldowns[userId] && userCooldowns[userId] > now) {
    const remaining = Math.ceil((userCooldowns[userId] - now) / 1000);
    if (callbackQueryOrMessage?.id) {
      bot.answerCallbackQuery(callbackQueryOrMessage.id, {
        text: `⛔️ لطفاً ${remaining} ثانیه صبر کنید.`,
        show_alert: true
      });
    } else if (callbackQueryOrMessage?.chat?.id) {
      bot.sendMessage(callbackQueryOrMessage.chat.id, `⛔️ لطفاً ${remaining} ثانیه صبر کنید.`);
    }
    return true;
  }

  // تعیین کول‌داون ۶۰ ثانیه‌ای
  userCooldowns[userId] = now + 60000;
  return false;
}

// UI - انتخاب نوع محاسبه
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

// UI - انتخاب رنک
function sendRankSelection(bot, chatId, step = "start") {
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
  );
}

// UI - ساب‌رنک
function sendSubRanks(bot, chatId, rank) {
  const found = allRanks.find(r => r.name === rank);
  const subs = found ? found.sub : [];
  if (!subs.length) {
    if (!userRankState[chatId].currentSub) {
      userRankState[chatId].currentSub = null;
    } else {
      userRankState[chatId].targetSub = null;
    }
    return sendStarSelection(bot, chatId, rank);
  }
  const buttons = subs.map(s => [{ text: s, callback_data: `rank_sub_${s}` }]);
  bot.sendMessage(chatId, `🎖 رنک ${rank} را دقیق‌تر مشخص کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

// UI - ستاره (با دکمه شیشه‌ای برای همه رنک‌ها به‌جز Immortal)
function sendStarSelection(bot, chatId, rank, step = "current") {
  const found = allRanks.find(r => r.name === rank);
  let minStars = 1, maxStars = (found && found.stars) ? found.stars : 5;
  if (rank === "Immortal") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های رنک Immortal را وارد کنید (مثلاً 12):");
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
  });
}

// UI - انتخاب وین‌ریت
function sendWinrateSelection(bot, chatId) {
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
  });
}

// الگوریتم مطلق ستاره
function getAbsoluteStarNum(rankName, sub, star) {
  let total = 0;
  for (const rank of allRanks) {
    if (rank.name === rankName) {
      if (rank.sub.length) {
        const subIdx = rank.sub.indexOf(sub);
        total += subIdx * rank.stars + star;
      } else {
        total += star;
      }
      break;
    } else {
      if (rank.sub.length) {
        total += rank.sub.length * rank.stars;
      } else if (rank.stars) {
        total += rank.stars;
      }
    }
  }
  return total;
}
function calculateWinsNeeded(stars, winrate) {
  const wr = winrate / 100;
  const gamesNeeded = Math.ceil(stars / wr);
  return { neededStars: stars, gamesNeeded };
}

// finalize & کم کردن امتیاز و کول‌داون
async function finalizeRankCalc(bot, userId, isCustom, adminMode = "point", adminId) {
  const state = userRankState[userId];
  const {
    currentStage, currentSub, currentStars,
    targetStage, targetSub, targetStars, winrate
  } = state;

  // اختلاف ستاره
  const cs = getAbsoluteStarNum(currentStage, currentSub, currentStars);
  const ts = getAbsoluteStarNum(targetStage, targetSub, targetStars);
  if (ts <= cs) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد.");
  }
  const wr = winrate || 50;
  const result = calculateWinsNeeded(ts - cs, wr);
  const daysNormal = Math.ceil(result.gamesNeeded / 5);
  const daysPerfect = Math.ceil(result.neededStars / 5);

  let msgPoint = "";
  let user = await getUser(userId);
  const isAdmin = userId === adminId;

  // محدودیت group: فقط برای غیر ادمین
  if (adminMode === "group" && !isAdmin) {
    const now = Date.now();
    if (user && user.last_chance_use && (now - user.last_chance_use) < 2 * 60 * 60 * 1000) {
      const left = Math.ceil((2*60*60*1000 - (now - user.last_chance_use)) / 60000);
      delete userRankState[userId];
      return bot.sendMessage(userId, `⏳ فقط هر ۲ ساعت یک‌بار می‌توانید استفاده کنید. زمان باقی مانده: ${left} دقیقه`);
    }
    await update(userRef(userId), { last_chance_use: now });
  }

  // کم کردن امتیاز: فقط برای غیر ادمین و فقط در حالت point
  if (adminMode === "point" && !isAdmin) {
    let userPoints = (user && typeof user.points === "number") ? user.points : 0;
    if (userPoints < 1) {
      delete userRankState[userId];
      return bot.sendMessage(userId, "❌ امتیاز کافی برای استفاده از این قابلیت ندارید.");
    }
    await update(userRef(userId), { points: userPoints - 1 });
    user = await getUser(userId);
    msgPoint = `\n✅ یک امتیاز از حساب شما کسر شد. امتیاز فعلی: ${user.points}`;
  }

  const msg = `📊 نتیجه محاسبه:
✅ فاصله تا رنک هدف: ${result.neededStars} ستاره
🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${result.gamesNeeded} بازی
🕐 اگر روزانه ۵ بازی با وین‌ریت ${wr}% انجام دهید: حدود ${daysNormal} روز
🟢 اگر هر روز ۵ برد کامل داشته باشید (وین‌ریت ۱۰۰٪): حدود ${daysPerfect} روز${msgPoint}`;
  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

// هندل دکمه
async function handleRankCallback(bot, userId, data, callbackQuery, adminMode = "point", adminId) {
  closeInline(bot, callbackQuery); // همیشه اول دکمه رو ببند
  if (checkSpam(userId, callbackQuery, bot)) return;

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
        finalizeRankCalc(bot, userId, false, adminMode, adminId);
      }
    }
    return;
  }

  if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    await finalizeRankCalc(bot, userId, true, adminMode, adminId);
    return;
  }
}

// هندل پیام متنی ایمورتال
function handleTextMessage(bot, msg, adminMode = "point", adminId) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state) return;

// فقط Immortal دستی
if (state.awaitingImmortalInput) {
  const value = parseInt(msg.text);
  if (isNaN(value) || value < 1 || value > 999) {
    return bot.sendMessage(chatId, "❌ لطفاً یک عدد معتبر بین 1 تا 999 وارد کنید (مثلاً 12).");
  }
  delete state.awaitingImmortalInput;
  state.currentStars = value;
  state.step = "targetRank";
  sendRankSelection(bot, chatId, "target");
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
    finalizeRankCalc(bot, chatId, false, adminMode, adminId);
  }
  return;
}
}

// خروجی
module.exports = {
  sendRankTypeSelection,
  handleRankCallback,
  userRankState,
  handleTextMessage
};