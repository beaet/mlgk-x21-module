// gem.js

// --- داده‌ها ---
let gems = [
  { id: 'gem55', amount: 55, price: 120000 },
  { id: 'gem100', amount: 100, price: 200000 }
];
let orders = {}; // orderId: {...}
let paymentReceipts = {}; // orderId: { fileId, createdAt }
const ADMINS = [123456789, 987654321]; // آیدی عددی ادمین‌ها اینجاست
const adminGemState = {}; // adminId: { step, ... }

// --- ابزار UI ---
function getGemInlineKeyboard() {
  return {
    inline_keyboard: gems.map(gem => [
      { text: `${gem.amount} جم`, callback_data: `buy_gem_${gem.id}` }
    ])
  };
}

function showGemAdminPanel(bot, userId) {
  bot.sendMessage(userId, 'مدیریت جم:', {
    reply_markup: {
      inline_keyboard: [
        [{ text: '➕ افزودن جم', callback_data: 'gem_admin_add' }],
        [{ text: '✏️ ویرایش جم', callback_data: 'gem_admin_edit' }],
        [{ text: '❌ حذف جم', callback_data: 'gem_admin_remove' }]
      ]
    }
  });
}

// --- خرید جم توسط کاربر ---
function startGemShop(bot, userId, state) {
  state[userId] = { step: null };
  bot.sendMessage(userId, 'مقدار جم مورد نظر را انتخاب کن:', {
    reply_markup: getGemInlineKeyboard()
  });
}

function handleGemSelect(bot, userId, gemId, state) {
  const gem = gems.find(g => g.id === gemId);
  if (!gem) return bot.sendMessage(userId, 'این بسته جم موجود نیست.');
  state[userId] = { step: 'gem_confirm', gemId: gem.id };
  bot.sendMessage(
    userId,
    `قیمت ${gem.amount} جم: ${gem.price.toLocaleString()} تومان\n\nبرای ادامه خرید روی دکمه زیر کلیک کن:`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ادامه خرید و پرداخت', callback_data: 'gem_continue' }],
          [{ text: 'انصراف', callback_data: 'cancel_gem' }]
        ]
      }
    }
  );
}

function handleGemContinue(bot, userId, state) {
  state[userId].step = 'gem_get_full_name';
  bot.sendMessage(userId, 'لطفاً نام و نام خانوادگی خود را وارد کن:');
}

async function handleGemUserData(bot, msg, state) {
  const userId = msg.from.id;
  const cur = state[userId];
  if (!cur) return;

  switch (cur.step) {
    case 'gem_get_full_name':
      cur.fullName = msg.text;
      cur.step = 'gem_get_telegram_id';
      return bot.sendMessage(userId, 'آیدی تلگرام خود را وارد کن (مثال: @username):');
    case 'gem_get_telegram_id':
      cur.telegramId = msg.text;
      cur.step = 'gem_get_game_account';
      return bot.sendMessage(userId, 'اکانت بازی خود را وارد کن:');
    case 'gem_get_game_account':
      cur.gameAccount = msg.text;
      cur.step = 'gem_get_numeric_id';
      return bot.sendMessage(userId, 'آیدی عددی بازی خود را وارد کن:');
    case 'gem_get_numeric_id':
      cur.numericGameId = msg.text;
      cur.step = 'gem_get_server_id';
      return bot.sendMessage(userId, 'آیدی سرور خود را وارد کن:');
    case 'gem_get_server_id':
      cur.serverId = msg.text;
      cur.step = 'gem_payment';
      return bot.sendMessage(userId, 'لطفاً مبلغ را به شماره کارت زیر واریز کن و عکس رسید را ارسال کن:\n\nشماره کارت: ۶۲۱۹-۸۶۱۰-۶۲۴۰-۴۳۲۱');
  }
}

async function handleGemPayment(bot, msg, state) {
  const userId = msg.from.id;
  const cur = state[userId];
  if (!cur || cur.step !== 'gem_payment' || !msg.photo) return;

  const orderId = `order_${Date.now()}_${userId}`;
  const fileId = msg.photo[msg.photo.length - 1].file_id;
  const gem = gems.find(g => g.id === cur.gemId);

  orders[orderId] = {
    orderId,
    userId,
    fullName: cur.fullName,
    telegramId: cur.telegramId,
    gameAccount: cur.gameAccount,
    numericGameId: cur.numericGameId,
    serverId: cur.serverId,
    gemId: gem.id,
    gemAmount: gem.amount,
    gemPrice: gem.price,
    status: 'pending',
    paymentFileId: fileId,
    createdAt: Date.now()
  };
  paymentReceipts[orderId] = { fileId, createdAt: Date.now() };

  // پیام به ادمین‌ها
  for (const adminId of ADMINS) {
    await bot.sendPhoto(adminId, fileId, {
      caption:
        `سفارش جم جدید:\nنام: ${cur.fullName}\nآیدی تلگرام: ${cur.telegramId}\nاکانت بازی: ${cur.gameAccount}\nآیدی عددی: ${cur.numericGameId}\nسرور: ${cur.serverId}\nتعداد جم: ${gem.amount}\nقیمت: ${gem.price.toLocaleString()} تومان\n\nسفارش منتظر بررسی است.`,
      reply_markup: {
        inline_keyboard: [
          [{ text: 'تکمیل شد', callback_data: `gem_done_${orderId}` }],
          [{ text: 'لغو سفارش', callback_data: `gem_cancel_${orderId}` }]
        ]
      }
    });
  }

  bot.sendMessage(userId, 'سفارش شما ثبت شد و در صف بررسی قرار گرفت. پس از تایید، به شما اطلاع داده خواهد شد.');
  state[userId] = null;
}

// --- مدیریت سفارش توسط ادمین ---
function handleAdminAction(bot, adminId, data) {
  const [_, action, orderId] = data.split('_');
  const order = orders[orderId];
  if (!order) return bot.sendMessage(adminId, 'سفارش پیدا نشد!');
  if (action === 'done') {
    order.status = 'done';
    bot.sendMessage(order.userId, 'سفارش شما تکمیل شد! ممنون از خرید شما.');
    bot.sendMessage(adminId, 'سفارش به حالت تکمیل تغییر یافت.');
  } else if (action === 'cancel') {
    order.status = 'cancelled';
    bot.sendMessage(order.userId, 'سفارش شما لغو شد. لطفاً با پشتیبانی تماس بگیرید.');
    bot.sendMessage(adminId, 'سفارش لغو شد.');
  }
}

// --- ادمین: افزودن جم ---
function handleGemAdminAdd(bot, userId) {
  adminGemState[userId] = { step: 'await_gem_name' };
  bot.sendMessage(userId, 'نام دکمه جم (مثلاً "55 جم") را وارد کنید:');
}

async function handleGemAdminText(bot, msg) {
  const userId = msg.from.id;
  const state = adminGemState[userId];
  if (!state) return;

  if (state.step === 'await_gem_name') {
    state.gemName = msg.text;
    state.step = 'await_gem_price';
    return bot.sendMessage(userId, 'قیمت این بسته جم را وارد کنید (مثلاً 120000):');
  }
  if (state.step === 'await_gem_price') {
    const price = +msg.text.replace(/\D/g, '');
    if (!price) return bot.sendMessage(userId, 'قیمت نامعتبر است!');
    const id = 'gem' + Date.now();
    gems.push({ id, amount: state.gemName, price });
    adminGemState[userId] = null;
    return bot.sendMessage(userId, `✅ بسته "${state.gemName}" با قیمت ${price.toLocaleString()} ثبت شد.`);
  }
}

// --- ادمین: حذف جم ---
function handleGemAdminRemove(bot, userId) {
  bot.sendMessage(userId, 'کدام جم را حذف کنیم؟', {
    reply_markup: {
      inline_keyboard: gems.map(g => [
        { text: g.amount, callback_data: `gem_admin_delete_${g.id}` }
      ])
    }
  });
}
function handleGemAdminDelete(bot, userId, gemId) {
  const idx = gems.findIndex(g => g.id === gemId);
  if (idx > -1) {
    const removed = gems.splice(idx, 1);
    bot.sendMessage(userId, `✅ بسته "${removed[0].amount}" حذف شد.`);
  } else {
    bot.sendMessage(userId, 'بسته جم پیدا نشد.');
  }
}

// --- ادمین: ویرایش جم ---
function handleGemAdminEdit(bot, userId) {
  bot.sendMessage(userId, 'کدام جم را می‌خواهی ویرایش کنی؟', {
    reply_markup: {
      inline_keyboard: gems.map(g => [
        { text: g.amount, callback_data: `gem_admin_edit_${g.id}` }
      ])
    }
  });
}
function handleGemAdminEditAskPrice(bot, userId, gemId) {
  adminGemState[userId] = { step: 'edit_gem_price', gemId };
  bot.sendMessage(userId, 'قیمت جدید را وارد کن:');
}
function handleGemAdminEditSetPrice(bot, userId, msg) {
  const state = adminGemState[userId];
  if (!state || state.step !== 'edit_gem_price') return;
  const gem = gems.find(g => g.id === state.gemId);
  const price = +msg.text.replace(/\D/g, '');
  if (!gem || !price) {
    bot.sendMessage(userId, 'مشکلی در تغییر قیمت بود!');
    adminGemState[userId] = null;
    return;
  }
  gem.price = price;
  bot.sendMessage(userId, `✅ قیمت جم "${gem.amount}" به ${price.toLocaleString()} تغییر یافت.`);
  adminGemState[userId] = null;
}

// --- Utility: حذف رسیدهای قدیمی ---
function cleanOldReceipts() {
  const now = Date.now();
  Object.entries(paymentReceipts).forEach(([orderId, val]) => {
    if (now - val.createdAt > 7 * 24 * 60 * 60 * 1000) {
      delete paymentReceipts[orderId];
      if (orders[orderId]) orders[orderId].paymentFileId = null;
    }
  });
}

// --- export ---
module.exports = {
  gems,
  ADMINS,
  adminGemState,
  startGemShop,
  handleGemSelect,
  handleGemContinue,
  handleGemUserData,
  handleGemPayment,
  handleAdminAction,
  showGemAdminPanel,
  handleGemAdminAdd,
  handleGemAdminText,
  handleGemAdminRemove,
  handleGemAdminDelete,
  handleGemAdminEdit,
  handleGemAdminEditAskPrice,
  handleGemAdminEditSetPrice,
  cleanOldReceipts
};