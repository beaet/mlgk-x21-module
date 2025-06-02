// rank.js

const { ref, get, update } = require("firebase/database");
const { userRef, getUser } = require("./helpers/user"); // مسیر را مطابق پروژه‌ات تنظیم کن

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
  Immortal: null // دستی وارد می‌شود
};

const userRankState = {};

function sendRankTypeSelection(bot, chatId) {
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
    {
      reply_markup: {
        inline_keyboard: rows
      }
    }
  );
}

function sendSubRanks(bot, chatId, rank) {
  const subs = subRanks[rank] || [];
  if (!subs.length) {
    userRankState[chatId].currentSub = null;
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
    buttons.push([
      { text: `${i}⭐`, callback_data: `rank_star_${i}` }
    ]);
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
  bot.sendMessage(chatId, "🔢 وین‌ریت دلخواه خود را انتخاب کنید:", {
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

  const result = calculateWinsNeeded(currentStars, targetStars, wr);

  const user = await getUser(userId);
  if (!user || (user.points || 0) < 1) {
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

module.exports = {
  sendRankTypeSelection,
  sendRankSelection,
  sendSubRanks,
  sendStarSelection,
  sendWinrateSelection,
  finalizeRankCalc,
  userRankState
};