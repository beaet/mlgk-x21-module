const { ref, get, update } = require("firebase/database");

// لیست رنک‌ها و ساب رنک‌ها
const rankStages = ["Warrior", "Elite", "Master", "Grandmaster", "Epic", "Legend", "Mythic", "Mythical Honor", "Glorious Mythic", "Immortal"];
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
  Mythic: 25,
  "Mythical Honor": 25,
  "Glorious Mythic": 50,
  Immortal: null // دستی وارد میشه
};
const userRankState = {};

function userRef(userId) {
  return ref(db, `users/${userId}`);
}
async function getUser(userId) {
  const snap = await get(userRef(userId));
  return snap.exists() ? snap.val() : null;
}

// ==== UI Functions ====
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
  const maxStars = starsPerRank[rank] || starsPerRank.default;
  if (rank === "Immortal") {
    bot.sendMessage(chatId, "🔢 تعداد ستاره‌های رنک ایمورتال را وارد کنید (مثلاً 12):");
    userRankState[chatId].awaitingImmortalInput = true;
    return;
  }
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

// ==== الگوریتم صحیح محاسبه تعداد ستاره ====
function getRankIndex(rank) {
  return rankStages.indexOf(rank);
}
function getSubRankIndex(rank, sub) {
  if (!subRanks[rank] || !sub) return 0;
  return subRanks[rank].indexOf(sub);
}
function getTotalStars(rank, sub, star) {
  // تعداد ستاره از Warrior III 0 تا این نقطه
  let total = 0;
  for (let i = 0; i < rankStages.length; i++) {
    const r = rankStages[i];
    const subs = subRanks[r] || [];
    let subCount = subs.length || 1;
    let starsCount = starsPerRank[r] || starsPerRank.default;
    if (starsCount === null) continue; // برای immortal ستاره دستی وارد میشه
    for (let j = 0; j < subCount; j++) {
      total += starsCount;
    }
    if (r === rank) {
      if (subs.length) {
        total -= (subCount - getSubRankIndex(rank, sub) - 1) * starsCount;
      }
      total += star;
      break;
    }
  }
  return total;
}
function calculateWinsNeeded(currentStars, targetStars, winrate) {
  const neededStars = targetStars - currentStars;
  const wr = winrate / 100;
  const gamesNeeded = Math.ceil(neededStars / wr);
  return { neededStars, gamesNeeded };
}

// ==== ذخیره و finalize ====
async function finalizeRankCalc(bot, userId, isCustom) {
  const state = userRankState[userId];
  const {
    currentStage,
    currentSub,
    currentStars,
    targetStage,
    targetSub,
    targetStars,
    winrate
  } = state;
  // محاسبه تعداد ستاره صحیح بر اساس رنک، ساب رنک و ستاره
  const cs = getTotalStars(currentStage, currentSub, currentStars);
  const ts = getTotalStars(targetStage, targetSub, targetStars);
  const wr = winrate || 50;
  if (ts <= cs) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد.");
  }

  const result = calculateWinsNeeded(cs, ts, wr);

  // کم کردن پوینت کاربر
  const user = await getUser(userId);
  if (!user || (user.points || 0) < 1) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "❌ امتیاز کافی برای استفاده از این قابلیت ندارید.");
  }
  await update(userRef(userId), { points: (user.points || 0) - 1 });

  const msg = `📊 نتیجه محاسبه:\n\n✅ فاصله تا رنک هدف: ${result.neededStars} ستاره\n🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${result.gamesNeeded} بازی\n🕐 اگر روزانه ۵ بازی انجام دهید: حدود ${Math.ceil(result.gamesNeeded / 5)} روز`;
  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

// ==== callBack هندل ====
async function handleRankCallback(bot, userId, data) {
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
        finalizeRankCalc(bot, userId, false);
      }
    }
    return;
  }

  if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    await finalizeRankCalc(bot, userId, true);
    return;
  }
}

// ==== هندل پیام متنی برای ایمورتال ====
function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state || !state.awaitingImmortalInput) return;

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
}

// ===== EXPORT =====
module.exports = {
  sendRankTypeSelection,
  handleRankCallback,
userRankState,
  handleTextMessage
};