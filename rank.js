const { ref, get, update } = require("firebase/database");
const { db } = require("./firebase"); // فرض بر اینکه db از این مسیر export شده
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
  Immortal: null
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
        callback_data: `rank_stage_${stage}_${rankStages[i].replace(/ /g, "_")}`
      }
    ];
    if (rankStages[i + 1]) {
      row.push({
        text: rankStages[i + 1],
        callback_data: `rank_stage_${stage}_${rankStages[i + 1].replace(/ /g, "_")}`
      });
    }
    rows.push(row);
  }

  const label = stage === "start" ? "👑 رنک فعلی خود را انتخاب کنید:" : "🎯 رنک هدف خود را انتخاب کنید:";
  bot.sendMessage(chatId, label, {
    reply_markup: { inline_keyboard: rows }
  });
}

function sendSubRanks(bot, chatId, stage, rank) {
  const subs = subRanks[rank] || [];
  if (!subs.length) {
    userRankState[chatId][`${stage}Sub`] = null;
    return sendStarSelection(bot, chatId, stage, rank);
  }

  const buttons = subs.map(s => [
    {
      text: s,
      callback_data: `rank_sub_${stage}_${s}`
    }
  ]);

  bot.sendMessage(chatId, `🎖 رنک ${rank} را دقیق‌تر مشخص کنید:`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

function sendStarSelection(bot, chatId, stage, rank) {
  const maxStars = starsPerRank[rank] || starsPerRank.default;
  if (rank === "Immortal") {
    bot.sendMessage(chatId, `🔢 تعداد ستاره‌های رنک ایمورتال را وارد کنید (${stage === "start" ? "فعلی" : "هدف"}):`);
    userRankState[chatId].awaitingImmortalInput = stage;
    return;
  }

  const buttons = [];
  for (let i = 1; i <= maxStars; i++) {
    buttons.push([
      {
        text: `${i}⭐`,
        callback_data: `rank_star_${stage}_${i}`
      }
    ]);
  }

  bot.sendMessage(chatId, `⭐️ تعداد ستاره‌های ${rank} (${stage === "start" ? "فعلی" : "هدف"}):`, {
    reply_markup: { inline_keyboard: buttons }
  });
}

function calculateStarDistance(state) {
  const index = (rank, sub) => {
    const rankIdx = rankStages.indexOf(rank);
    const subIdx = subRanks[rank]?.indexOf(sub) ?? 0;
    return rankIdx * 10 + subIdx;
  };

  const from = index(state.startStage, state.startSub);
  const to = index(state.targetStage, state.targetSub);
  if (to < from) return -1;

  let total = 0;
  for (let i = from; i < to; i++) {
    const rank = rankStages[Math.floor(i / 10)];
    total += starsPerRank[rank] || starsPerRank.default;
  }
  total -= state.startStars;
  total += state.targetStars;
  return total;
}

async function finalizeRankCalc(bot, userId, isCustom) {
  const state = userRankState[userId];
  const stars = calculateStarDistance(state);

  if (stars <= 0) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "⛔️ رنک هدف باید بالاتر از رنک فعلی باشد.");
  }

  const wr = isCustom ? (state.winrate || 50) : 50;
  const gamesNeeded = Math.ceil(stars / (wr / 100));

  const user = await getUser(userId);
  if (!user || (user.points || 0) < 1) {
    delete userRankState[userId];
    return bot.sendMessage(userId, "❌ امتیاز کافی برای استفاده از این قابلیت ندارید.");
  }

  await update(userRef(userId), { points: (user.points || 0) - 1 });

  const msg = `📊 نتیجه محاسبه:

✅ فاصله تا رنک هدف: ${stars} ستاره
🎯 تعداد بازی مورد نیاز با وین‌ریت ${wr}%: ${gamesNeeded} بازی
🕐 اگر روزانه 5 بازی انجام دهید: حدود ${Math.ceil(gamesNeeded / 5)} روز`;

  bot.sendMessage(userId, msg);
  delete userRankState[userId];
}

function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const state = userRankState[chatId];
  if (!state || !state.awaitingImmortalInput) return;

  const stage = state.awaitingImmortalInput;
  const value = parseInt(msg.text);
  if (isNaN(value) || value <= 0 || value > 1000) {
    return bot.sendMessage(chatId, "❌ لطفاً یک عدد معتبر وارد کنید.");
  }

  userRankState[chatId][`${stage}Stars`] = value;
  delete state.awaitingImmortalInput;

  if (stage === "start") {
    sendRankSelection(bot, chatId, "target");
  } else {
    if (state.type === "custom") {
      sendWinrateSelection(bot, chatId);
    } else {
      finalizeRankCalc(bot, chatId, false);
    }
  }
}

function sendWinrateSelection(bot, chatId) {
  const options = [40, 50, 60, 70, 80, 90, 100];
  const buttons = options.map(p => [
    { text: `${p}% وین ریت`, callback_data: `rank_winrate_${p}` }
  ]);
  bot.sendMessage(chatId, "🎯 وین‌ریت دلخواه را انتخاب کنید:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

async function handleRankCallback(bot, chatId, data) {
  const state = userRankState[chatId] || (userRankState[chatId] = {});

  if (data === "rank_calc_basic" || data === "rank_calc_customwin") {
    state.type = data === "rank_calc_customwin" ? "custom" : "basic";
    sendRankSelection(bot, chatId, "start");

  } else if (data.startsWith("rank_stage_")) {
    const [, stage, ...r] = data.split("_");
    const rank = r.join(" ").trim();
    state[`${stage}Stage`] = rank;
    sendSubRanks(bot, chatId, stage, rank);

  } else if (data.startsWith("rank_sub_")) {
    const [, stage, sub] = data.split("_");
    state[`${stage}Sub`] = sub;
    sendStarSelection(bot, chatId, stage, state[`${stage}Stage`]);

  } else if (data.startsWith("rank_star_")) {
    const [, stage, star] = data.split("_");
    state[`${stage}Stars`] = parseInt(star);
    if (stage === "start") {
      sendRankSelection(bot, chatId, "target");
    } else {
      if (state.type === "custom") {
        sendWinrateSelection(bot, chatId);
      } else {
        finalizeRankCalc(bot, chatId, false);
      }
    }

  } else if (data.startsWith("rank_winrate_")) {
    const wr = parseInt(data.replace("rank_winrate_", ""));
    state.winrate = wr;
    finalizeRankCalc(bot, chatId, true);
  }
}

module.exports = {
  sendRankTypeSelection,
  handleTextMessage,
  handleRankCallback
};