const fs = require('fs');
const { set, get } = require('firebase/database');


// بارگذاری سوالات از challenge.json
function loadQuestions() {
  return JSON.parse(fs.readFileSync('./challenge.json', 'utf8'));
}

// دریافت رشته هفته فعلی (سال-هفته)
function getCurrentWeekString() {
  const now = new Date();
  const onejan = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil((((now - onejan) / 86400000) + onejan.getDay() + 1) / 7);
  return `${now.getFullYear()}-${week}`;
}

// وضعیت چالش برای هر کاربر
const challengeState = {}; // userId -> state

// شروع چالش برای کاربر
async function startChallenge({ userId, bot, db, challengeUserRef, adminId }) {
  const weekStr = getCurrentWeekString();
if (typeof challengeUserRef !== "function") {
  await bot.sendMessage(userId, "خطای داخلی: challengeUserRef تابع نیست.");
  return;
}
const prev = await get(challengeUserRef(userId, weekStr));
if (prev.exists() && userId !== adminId) {
  await bot.sendMessage(userId, "❌ شما این هفته چالش را انجام داده‌اید! هفته بعد دوباره امتحان کنید.");
  return;
}
// همینجا یک رکورد اولیه ذخیره کن تا فوراً قفل بشه
if (userId !== adminId) {
  await set(challengeUserRef(userId, weekStr), { started: true });
}
  const questions = loadQuestions();
  const selected = questions.sort(() => Math.random() - 0.5).slice(0, 3);
  challengeState[userId] = {
    week: weekStr,
    questions: selected,
    current: 0,
    correct: 0,
    finished: false,
    results: [],
    waitingFor: null
  };
  sendChallengeQuestion(userId, bot, challengeUserRef, db, adminId);
}

// ارسال سوال به کاربر (پشتیبانی از هر تعداد گزینه)
function sendChallengeQuestion(userId, bot, challengeUserRef, db, adminId) {
  const state = challengeState[userId];
  if (!state || state.finished) return;
  const qObj = state.questions[state.current];
  const qNum = state.current + 1;
  const total = state.questions.length;

  // تقسیم گزینه‌ها در چند ردیف (هر ردیف 2 یا 3 تا)
  let inlineKeyboard = [];
  const perRow = qObj.choices.length > 4 ? 3 : 2;
  for (let i = 0; i < qObj.choices.length; i += perRow) {
    inlineKeyboard.push(
      qObj.choices.slice(i, i + perRow).map((choice, idx) => ({
        text: choice,
        callback_data: `challenge_answer_${qNum - 1}_${i + idx}`
      }))
    );
  }

  const opts = {
    reply_markup: {
      inline_keyboard: inlineKeyboard
    }
  };
  bot.sendMessage(
    userId,
    `سوال ${qNum} از ${total}:\n${qObj.question}`,
    opts
  ).then(msg => {
    let answered = false;
    const messageId = msg.message_id;
    const chatId = msg.chat.id;
    const timer = setTimeout(async () => {
      if (!answered) {
        answered = true;
        state.waitingFor.expired = true;
        state.results.push({ correct: false, timedOut: true });
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: chatId, message_id: messageId });
        await bot.sendMessage(userId, `⏱ زمان این سوال تمام شد! (${qNum}/${total})`);
        nextChallengeOrFinish(userId, bot, state, challengeUserRef, db, adminId);
      }
    }, 10000);
    state.waitingFor = {
      qIdx: qNum - 1,
      timer,
      expired: false,
      messageId,
      chatId,
      answeredFlag: () => answered,
      setAnswered: () => { answered = true; }
    };
  });
}

// هندل جواب کاربر به سوال چالش
async function handleAnswer({ query, bot, updatePoints, challengeUserRef, db, adminId }) {
  const userId = query.from.id;
  const state = challengeState[userId];
  if (!state || state.finished) return;
const parts = query.data.split('_');
const qIdx = parseInt(parts[2]);
const ansIdx = parseInt(parts[3]);
  if (!state.waitingFor || state.waitingFor.qIdx !== qIdx) return;
  if (state.waitingFor.expired) {
    await bot.answerCallbackQuery(query.id, { text: '⏱ وقت پاسخ به این سوال تموم شده.', show_alert: true });
    return;
  }
  if (state.waitingFor.answeredFlag()) {
    await bot.answerCallbackQuery(query.id, { text: 'این سوال قبلا جواب داده شده.', show_alert: false });
    return;
  }
  state.waitingFor.setAnswered();
  clearTimeout(state.waitingFor.timer);
  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: state.waitingFor.chatId, message_id: state.waitingFor.messageId });
  const qObj = state.questions[qIdx];
  const correct = qObj.answer === ansIdx;
  if (correct) state.correct++;
  state.results.push({ correct, timedOut: false });
  if (correct) {
    if (updatePoints) await updatePoints(userId, 2);
    await bot.answerCallbackQuery(query.id, { text: `✅ درست جواب دادی! +2 امتیاز (${qIdx + 1}/${state.questions.length})`, show_alert: false });
    await bot.sendMessage(userId, `✅ درست جواب دادی! +2 امتیاز (${qIdx + 1}/${state.questions.length})`);
  } else {
    await bot.answerCallbackQuery(query.id, { text: `❌ اشتباه بود! (${qIdx + 1}/${state.questions.length})`, show_alert: false });
    await bot.sendMessage(userId, `❌ اشتباه جواب دادی! (${qIdx + 1}/${state.questions.length})`);
  }
  setTimeout(() => nextChallengeOrFinish(userId, bot, state, challengeUserRef, db, adminId), 400);
}

// سوال بعدی یا پایان چالش
async function nextChallengeOrFinish(userId, bot, state, challengeUserRef, db, adminId) {
  state.current++;
  if (state.current < state.questions.length) {
    sendChallengeQuestion(userId, bot, challengeUserRef, db, adminId);
  } else {
    state.finished = true;
    if (typeof challengeUserRef === "function" && userId !== adminId) {
      await set(challengeUserRef(userId, state.week), {
        finished: true,
        correct: state.correct,
        total: state.questions.length,
        results: state.results
      });
    }
    let details = '';
    state.results.forEach((r, i) => {
      details += `سوال ${i+1}: ${r.timedOut ? '⏱ بی‌جواب' : (r.correct ? '✅ صحیح' : '❌ اشتباه')}\n`;
    });
    await bot.sendMessage(
      userId,
      `🎉 چالش این هفته تمام شد!\nتعداد پاسخ صحیح: ${state.correct} از ${state.questions.length}\n${details}امتیاز کل: ${state.correct * 2} سکه`
    );
    delete challengeState[userId];
  }
}

module.exports = { startChallenge, handleAnswer, challengeState };