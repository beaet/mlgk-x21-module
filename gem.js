const { get, set, ref, push, remove, update } = require("firebase/database");
const adminId = 381183017;
const userStates = {};
const gemOrdersRef = (id) => ref(db, `gem_orders/${id}`);

// نمایش بسته‌ها به کاربر
async function showGemPackages(userId, bot, db) {
  const snap = await get(ref(db, "gem_packages"));
  const list = snap.exists() ? snap.val() : {};
  const buttons = Object.keys(list).map((key) => [
    { text: list[key].label, callback_data: `buy_gem_${key}` }
  ]);

  if (!buttons.length) {
    await bot.sendMessage(userId, "فعلاً بسته‌ای برای خرید موجود نیست.");
    return;
  }

  await bot.sendMessage(userId, "یکی از بسته‌های جم زیر را انتخاب کنید:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

// مرحله انتخاب بسته
async function handleBuyGemStep(userId, data, bot, db) {
  const key = data.replace("buy_gem_", "");
  const snap = await get(ref(db, `gem_packages/${key}`));
  if (!snap.exists()) return bot.sendMessage(userId, "بسته یافت نشد!");

  const item = snap.val();

  await bot.sendMessage(
    userId,
    `💎 بسته ${item.label}\n💰 قیمت: ${item.price} تومان\n\nبرای ادامه خرید روی دکمه زیر کلیک کنید:`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "ادامه خرید", callback_data: `gem_continue_${key}` }]]
      }
    }
  );
}

// شروع فرم سفارش
async function handleGemContinue(userId, bot, db, query) {
  const key = query.data.replace("gem_continue_", "");
  const snap = await get(ref(db, `gem_packages/${key}`));
  if (!snap.exists()) return;

  userStates[userId] = { type: "gem", step: "fullname", packKey: key, data: {} };

  await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id
  });

  await bot.sendMessage(userId, "📝 لطفاً نام و نام خانوادگی خود را وارد کنید:");
}

// مراحل ثبت فرم توسط کاربر
async function handleGemUserReply(userId, text, bot, db) {
  const state = userStates[userId];
  if (!state || state.type !== "gem") return;

  switch (state.step) {
    case "fullname":
      state.data.fullname = text;
      state.step = "telegram";
      await bot.sendMessage(userId, "📧 لطفاً آیدی تلگرام خود را وارد کنید:");
      break;

    case "telegram":
      state.data.telegram = text;
      state.step = "game_account";
      await bot.sendMessage(userId, "🎮 نام اکانت بازی خود را وارد کنید:");
      break;

    case "game_account":
      state.data.game_account = text;
      state.step = "game_id";
      await bot.sendMessage(userId, "🆔 آیدی عددی بازی خود را وارد کنید:");
      break;

    case "game_id":
      state.data.game_id = text;
      state.step = "server_id";
      await bot.sendMessage(userId, "🌐 آیدی سرور خود را وارد کنید:");
      break;

    case "server_id":
      state.data.server_id = text;
      state.step = "receipt";
      await bot.sendMessage(
        userId,
        "💳 شماره کارت: 6037997654321234\nلطفاً پس از پرداخت، عکس رسید را ارسال کنید:"
      );
      break;

    default:
      break;
  }
}

// پردازش تصویر رسید پرداخت
async function handlePhotoReceipt(msg, bot, db) {
  const userId = msg.from.id;
  const state = userStates[userId];
  if (!state || state.step !== "receipt") return;

  const file_id = msg.photo[msg.photo.length - 1].file_id;
  state.data.receipt = file_id;

  const packSnap = await get(ref(db, `gem_packages/${state.packKey}`));
  const pack = packSnap.exists() ? packSnap.val() : null;

  const data = {
    ...state.data,
    pack: pack?.label || "نامشخص",
    timestamp: Date.now(),
    status: "pending"
  };

  const orderRef = push(ref(db, "gem_orders"));
  await set(orderRef, data);

  await bot.sendMessage(userId, "✅ سفارش شما ثبت شد و در صف بررسی قرار گرفت.");

  await bot.sendPhoto(adminId, file_id, {
    caption: `📦 سفارش جدید جم\n\n👤 ${data.fullname}\n🎮 ${data.game_account} (${data.game_id}-${data.server_id})\n📧 ${data.telegram}\n💎 بسته: ${data.pack}`,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✔️ تکمیل شد", callback_data: `gem_done_${orderRef.key}` },
          { text: "❌ لغو شد", callback_data: `gem_cancel_${orderRef.key}` }
        ]
      ]
    }
  });

  delete userStates[userId];
}

// عملیات ادمین روی سفارش
async function handleGemOrderStatusAction(data, bot, db) {
  const [_, action, id] = data.split("_");
  const orderSnap = await get(ref(db, `gem_orders/${id}`));
  if (!orderSnap.exists()) return;

  const order = orderSnap.val();
  if (!order?.telegram) return;

  const chatId = order.telegram;
  const statusText = action === "done"
    ? "✅ سفارش جم شما با موفقیت انجام شد."
    : "❌ سفارش شما به دلایلی لغو شد. لطفاً با پشتیبانی تماس بگیرید.";

  await bot.sendMessage(chatId, statusText);
  await update(ref(db, `gem_orders/${id}`), { status: action });
}

// پنل مدیریت بسته‌های جم
async function showGemAdminPanel(bot, userId, db) {
  const snap = await get(ref(db, "gem_packages"));
  const list = snap.exists() ? snap.val() : {};

  const buttons = Object.keys(list).map((key) => [
    { text: `📝 ${list[key].label}`, callback_data: `gem_admin_edit_${key}` },
    { text: "🗑 حذف", callback_data: `gem_admin_delete_${key}` }
  ]);

  buttons.push([{ text: "➕ افزودن بسته جدید", callback_data: "gem_admin_add" }]);

  await bot.sendMessage(userId, "🎯 مدیریت بسته‌های جم:", {
    reply_markup: { inline_keyboard: buttons }
  });
}

// عملیات ادمین (افزودن/ویرایش/حذف بسته)
async function handleGemAdminAction(bot, userId, data, query, db) {
  if (userId !== adminId) return;

  if (data === "gem_admin_add") {
    userStates[userId] = { type: "gem_add_name" };
    await bot.sendMessage(userId, "📝 لطفاً نام بسته جم را وارد کنید:");
    await bot.answerCallbackQuery(query.id);
    return;
  }

  if (data.startsWith("gem_admin_delete_")) {
    const key = data.replace("gem_admin_delete_", "");
    await remove(ref(db, `gem_packages/${key}`));
    await bot.answerCallbackQuery(query.id, { text: "✅ بسته حذف شد." });
    await showGemAdminPanel(bot, userId, db);
    return;
  }

  if (data.startsWith("gem_admin_edit_")) {
    const key = data.replace("gem_admin_edit_", "");
    const snap = await get(ref(db, `gem_packages/${key}`));
    if (!snap.exists()) return;

    const gem = snap.val();
    userStates[userId] = {
      type: "gem_edit_name",
      editKey: key,
      old: gem
    };

    await bot.sendMessage(userId, `📝 نام جدید بسته را وارد کنید:\n(نام فعلی: ${gem.label})`);
    await bot.answerCallbackQuery(query.id);
  }
}

// مدیریت مراحل افزودن یا ویرایش بسته
async function handleGemPackageTextInput(userId, text, bot, db) {
  const state = userStates[userId];
  if (!state) return;

  if (state.type === "gem_add_name") {
    state.label = text;
    state.type = "gem_add_price";
    await bot.sendMessage(userId, "💰 قیمت بسته را وارد کنید (تومان):");
  } else if (state.type === "gem_add_price") {
    const price = parseInt(text);
    if (isNaN(price)) return bot.sendMessage(userId, "❌ قیمت نامعتبر است!");

    await push(ref(db, "gem_packages"), {
      label: state.label,
      price
    });

    delete userStates[userId];
    await bot.sendMessage(userId, "✅ بسته جدید با موفقیت افزوده شد.");
    await showGemAdminPanel(bot, userId, db);
  }

  else if (state.type === "gem_edit_name") {
    state.newLabel = text;
    state.type = "gem_edit_price";
    await bot.sendMessage(userId, "💰 قیمت جدید بسته را وارد کنید:");
  }

  else if (state.type === "gem_edit_price") {
    const price = parseInt(text);
    if (isNaN(price)) return bot.sendMessage(userId, "❌ قیمت نامعتبر است!");

    await update(ref(db, `gem_packages/${state.editKey}`), {
      label: state.newLabel,
      price
    });

    delete userStates[userId];
    await bot.sendMessage(userId, "✅ بسته با موفقیت ویرایش شد.");
    await showGemAdminPanel(bot, userId, db);
  }
}

// حذف سفارش‌های قدیمی
async function cleanupOldOrders(db) {
  const ordersSnap = await get(ref(db, "gem_orders"));
  if (!ordersSnap.exists()) return;

  const now = Date.now();
  for (const key in ordersSnap.val()) {
    if (now - ordersSnap.val()[key].timestamp > 7 * 24 * 60 * 60 * 1000) {
      await remove(ref(db, `gem_orders/${key}`));
    }
  }
}

module.exports = {
  showGemPackages,
  handleBuyGemStep,
  handleGemContinue,
  handleGemUserReply,
  handlePhotoReceipt,
  handleGemOrderStatusAction,
  showGemAdminPanel,
  handleGemAdminAction,
  handleGemPackageTextInput,
  cleanupOldOrders
};