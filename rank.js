const fs = require("fs");
const { ref, get, update } = require("firebase/database");

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

function sendRankSelection(bot, chatId, stage = "start") {
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
    stage === "start" ? "👑 رنک فعلی خود را انتخاب کنید:" : "🎯 رنک هدف خود را انتخاب کنید:",
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

function calculateWinsNeeded(current, target, winrate) {
  const neededStars = target - current;
  const wr = winrate / 100;
  const gamesNeeded = Math.ceil(neededStars / wr);
  return { neededStars, gamesNeeded };
}

async function finalizeRankCalc(bot, userId, isCustom) {
  const state = userRankState[userId];
  const currentStars = state.currentStars;
  const targetStars = state.targetStars;
  const wr = state.winrate || 50;

  if (targetStars <= currentStars) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد.");
  }

  const result = calculateWinsNeeded(currentStars, targetStars, wr);

  const user = await getUser(userId);
  if (!user || (user.points || 0) < 1) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "❌ امتیاز کافی برای استفاده از این قابلیت ندارید.");
  }

  await update(userRef(userId), {
    points: (user.points || 0) - 1
  });

  const msg = `📊 نتیجه محاسبه:

✅ فاصله تا رنک هدف: ${result.neededStars} ستاره
🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${result.gamesNeeded} بازی
🕐 اگر روزانه 5 بازی انجام دهید: حدود ${Math.ceil(result.gamesNeeded / 5)} روز`;

  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

async function handleRankCallback(bot, userId, data) {
  if (!userRankState[userId]) userRankState[userId] = {};
  const state = userRankState[userId];

  if (data === "rank_calc_basic") {
    state.type = "basic";
    sendRankSelection(bot, userId, "start");

  } else if (data === "rank_calc_customwin") {
    state.type = "custom";
    sendRankSelection(bot, userId, "start");

  } else if (data.startsWith("rank_stage_")) {
    const rank = data.replace("rank_stage_", "").replace(/_/g, " ");
    if (!state.currentStage) {
      state.currentStage = rank;
      sendSubRanks(bot, userId, rank);
    } else {
      state.targetStage = rank;
      sendSubRanks(bot, userId, rank);
    }

  } else if (data.startsWith("rank_sub_")) {
    const sub = data.replace("rank_sub_", "");
    if (!state.currentSub) {
      state.currentSub = sub;
      sendStarSelection(bot, userId, state.currentStage);
    } else {
      state.targetSub = sub;
      sendStarSelection(bot, userId, state.targetStage);
    }

  } else if (data.startsWith("rank_star_")) {
    const star = parseInt(data.replace("rank_star_", ""));
    if (!state.currentStars) {
      state.currentStars = star;
      sendRankSelection(bot, userId, "target");
    } else {
      state.targetStars = star;
      if (state.type === "custom") {
        sendWinrateSelection(bot, userId);
      } else {
        finalizeRankCalc(bot, userId, false);
      }
    }

  } else if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    finalizeRankCalc(bot, userId, true);
  }
}

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
    sendRankSelection(bot, chatId, "target");
  } else {
    state.targetStars = value;
    if (state.type === "custom") {
      sendWinrateSelection(bot, chatId);
    } else {
      finalizeRankCalc(bot, chatId, false);
    }
  }
}

module.exports = {
  sendRankTypeSelection,
  handleRankCallback,
  handleTextMessage
};