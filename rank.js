const { ref, get, update } = require("firebase/database");
const { db } = require("./index"); // مطمئن شو db از initializeApp درست export شده

const userRankState = {};

const rankStages = [
  "Warrior", "Elite", "Master", "Grandmaster",
  "Epic", "Legend", "Mythic",
  "Mythical Honor", "Glorious Mythic", "Immortal"
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
  Mythic: 25,
  "Mythical Honor": 25,
  "Glorious Mythic": 50,
  Immortal: null // دستی
};

const rankOrder = [];
for (const rank of rankStages) {
  const subs = subRanks[rank] || [];
  if (subs.length) {
    for (const sub of subs) {
      rankOrder.push({ rank, sub });
    }
  } else {
    rankOrder.push({ rank, sub: null });
  }
}

function rankIndex(rank, sub) {
  return rankOrder.findIndex(r => r.rank === rank && r.sub === sub);
}

function userRef(userId) {
  return ref(db, `users/${userId}`);
}

async function getUser(userId) {
  const snap = await get(userRef(userId));
  return snap.exists() ? snap.val() : null;
}

function sendRankTypeSelection(bot, chatId) {
  userRankState[chatId] = {};
  bot.sendMessage(chatId, "🔢 نوع محاسبه را انتخاب کن:", {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🧮 محاسبه کلی", callback_data: "rank_calc_basic" },
          { text: "🎯 با وین‌ریت دلخواه", callback_data: "rank_calc_customwin" }
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
    stage === "start" ? "👑 رنک فعلی‌ت رو انتخاب کن:" : "🎯 رنک هدف رو انتخاب کن:",
    { reply_markup: { inline_keyboard: rows } }
  );
}

function sendSubRanks(bot, chatId, rank) {
  const subs = subRanks[rank] || [];
  if (!subs.length) {
    handleSubRank(bot, chatId, null);
    return;
  }
  const buttons = subs.map(s => [{ text: s, callback_data: `rank_sub_${s}` }]);
  bot.sendMessage(chatId, `🎖 رنک ${rank} رو دقیق‌تر مشخص کن:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

function sendStarSelection(bot, chatId, rank) {
  const maxStars = starsPerRank[rank] || starsPerRank.default;
  if (rank === "Immortal") {
    userRankState[chatId].awaitingImmortalInput = true;
    return bot.sendMessage(chatId, "🔢 تعداد ستاره‌های ایمورتال رو وارد کن (مثلاً 12):");
  }

  const buttons = [];
  for (let i = 1; i <= maxStars; i++) {
    buttons.push([{ text: `${i}⭐`, callback_data: `rank_star_${i}` }]);
  }
  bot.sendMessage(chatId, "⭐️ تعداد ستاره‌ات رو انتخاب کن:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

function sendWinrateSelection(bot, chatId) {
  const options = [40, 50, 60, 70, 80, 90, 100];
  const buttons = options.map(p => [{ text: `${p}% وین‌ریت`, callback_data: `rank_winrate_${p}` }]);
  bot.sendMessage(chatId, "🎯 وین‌ریت دلخواهت رو انتخاب کن:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function finalizeRankCalc(bot, userId, isCustom) {
  const state = userRankState[userId];
  const user = await getUser(userId);
  if (!user || user.points < 1) {
    return bot.sendMessage(userId, "❌ امتیاز کافی نداری.");
  }

  const startIdx = rankIndex(state.currentStage, state.currentSub);
  const endIdx = rankIndex(state.targetStage, state.targetSub);

  if (endIdx <= startIdx) {
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر باشه.");
  }

  let totalStars = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    const { rank } = rankOrder[i];
    totalStars += starsPerRank[rank] || starsPerRank.default;
  }

  const winrate = state.winrate || 50;
  const gamesNeeded = Math.ceil(totalStars / (winrate / 100));

  await update(userRef(userId), { points: user.points - 1 });

  bot.sendMessage(userId, `📊 نتیجه:

✅ فاصله تا رنک هدف: ${totalStars} ستاره
🎯 با وین‌ریت ${winrate}% نیاز به ${gamesNeeded} بازی داری
🕐 اگه روزی 5 تا بازی کنی، حدود ${Math.ceil(gamesNeeded / 5)} روز طول می‌کشه`);

  delete userRankState[userId];
}

function handleSubRank(bot, userId, sub) {
  const state = userRankState[userId];
  if (!state.currentSub) {
    state.currentSub = sub;
    sendStarSelection(bot, userId, state.currentStage);
  } else {
    state.targetSub = sub;
    sendStarSelection(bot, userId, state.targetStage);
  }
}

async function handleRankCallback(bot, userId, data) {
  if (!userRankState[userId]) userRankState[userId] = {};
  const state = userRankState[userId];

  if (data === "rank_calc_basic" || data === "rank_calc_customwin") {
    state.type = data === "rank_calc_basic" ? "basic" : "custom";
    sendRankSelection(bot, userId, "start");
  }

  else if (data.startsWith("rank_stage_")) {
    const rank = data.replace("rank_stage_", "").replace(/_/g, " ");
    if (!state.currentStage) {
      state.currentStage = rank;
      sendSubRanks(bot, userId, rank);
    } else {
      state.targetStage = rank;
      sendSubRanks(bot, userId, rank);
    }
  }

  else if (data.startsWith("rank_sub_")) {
    const sub = data.replace("rank_sub_", "");
    handleSubRank(bot, userId, sub);
  }

  else if (data.startsWith("rank_star_")) {
    const stars = parseInt(data.replace("rank_star_", ""));
    if (!state.currentStars) {
      state.currentStars = stars;
      sendRankSelection(bot, userId, "target");
    } else {
      state.targetStars = stars;
      if (state.type === "custom") {
        sendWinrateSelection(bot, userId);
      } else {
        finalizeRankCalc(bot, userId, false);
      }
    }
  }

  else if (data.startsWith("rank_winrate_")) {
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
    return bot.sendMessage(chatId, "❌ عدد معتبر وارد کن (مثلاً 12)");
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
  handleTextMessage,
  userRankState
};