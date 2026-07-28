// staff_bot.js
const line = require('@line/bot-sdk');

// 1. CẤU HÌNH STAFF BOT
const config = {
    channelAccessToken: process.env.STAFF_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.STAFF_CHANNEL_SECRET
};

const client = new line.Client(config);

/**
 * QUẢN LÝ TRẠNG THÁI (STATE MACHINE)
 * Lưu trạng thái tạm thời của nhân viên để xử lý hội thoại nhiều bước.
 * Format: { userId: { step: 'WAITING_DATE', action: 'LATE', data: { date: '...' } } }
 */
let USER_SESSIONS = {};

// Các hằng số trạng thái
const STEPS = {
    IDLE: 'IDLE',
    SELECT_DATE_OFF: 'SELECT_DATE_OFF',
    SELECT_DATE_LATE: 'SELECT_DATE_LATE',
    SELECT_TIME_LATE: 'SELECT_TIME_LATE',
    SELECT_START_TIME_MEAL: 'SELECT_START_TIME_MEAL',
    SELECT_END_TIME_MEAL: 'SELECT_END_TIME_MEAL',
    SELECT_START_TIME_OUT: 'SELECT_START_TIME_OUT',
    SELECT_END_TIME_OUT: 'SELECT_END_TIME_OUT'
};

// 2. HÀM XỬ LÝ CHÍNH (Được gọi từ index.js)
async function handleEvent(event, context) {
    // Giải nén context để lấy các hàm Service cần thiết
    const {
        ghiVaoSheet, normalizeDateStrict, getTaipeiNow, formatDateTimeString,
        STAFF_LIST, ID_BA_CHU, clientMain,
        findStaffRowByLineId, updateScheduleCell, updateDailyStatus
    } = context;

    const userId = event.source.userId;
    const isText = event.type === 'message' && event.message.type === 'text';
    const isPostback = event.type === 'postback';

    if (!isText && !isPostback) return Promise.resolve(null);

    // Lấy nội dung tin nhắn hoặc dữ liệu postback
    let input = '';
    let postbackParams = null;
    if (isText) input = event.message.text.trim();
    else if (isPostback) {
        input = event.postback.data;
        postbackParams = event.postback.params; // Chứa time/date từ picker
    }

    // --- LOGIC 1: XÁC THỰC DANH TÍNH (Authentication) BẰNG LINE ID ---
    // Tìm trong Database/Sheet qua hàm findStaffRowByLineId (Dựa vào cột F)
    let staffInfo = null;
    if (findStaffRowByLineId) {
        staffInfo = await findStaffRowByLineId(userId);
    }

    // Nếu không tìm thấy LINE ID trong Sheet -> Chặn luôn, không cho chọn tên
    if (!staffInfo) {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `⛔ 您的帳號尚未綁定。\n\n請複製並將此 ID 傳送給管理員以新增至系統：\n\n${userId}`
        });
    }

    const myName = staffInfo.name;

    // Khởi tạo session nếu chưa có
    if (!USER_SESSIONS[userId]) USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} };
    const session = USER_SESSIONS[userId];

    // --- LOGIC 2: ĐIỀU HƯỚNG MENU CHÍNH ---
    if (input.toLowerCase() === 'menu' || input === 'Help' || input === 'reset' || input === '選單') {
        USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} }; // Reset trạng thái
        return showMainMenu(event.replyToken, myName);
    }

    if (input === '我的資訊' || input === 'my id') {
        return client.replyMessage(event.replyToken, {
            type: 'text',
            text: `ℹ️ 您的資訊：\n\n- 姓名：${myName}\n- 系統 ID：${userId}`
        });
    }

    // --- LOGIC 3: XỬ LÝ THEO TRẠNG THÁI & INPUT ---

    // A. MENU COMMANDS (Khi đang rảnh hoặc người dùng bấm menu)
    if (input === 'CMD:RequestOff' || input === '我要請假') {
        USER_SESSIONS[userId].step = STEPS.SELECT_DATE_OFF;
        return showCalendar(event.replyToken, "📅 請選擇請假日期：", "PICK_DATE_OFF");
    }

    if (input === 'CMD:LateOptions' || input === '我會遲到') {
        USER_SESSIONS[userId].step = STEPS.SELECT_DATE_LATE;
        return showCalendar(event.replyToken, "📅 請問您哪天會遲到？", "PICK_DATE_LATE");
    }

    if (input === 'CMD:MealBreak' || input === '我要吃飯') {
        USER_SESSIONS[userId].step = STEPS.SELECT_START_TIME_MEAL;
        return client.replyMessage(event.replyToken, {
            type: 'template', altText: '選擇開始時間',
            template: {
                type: 'buttons', text: '🍱 請問您幾點開始吃飯？',
                actions: [{ type: 'datetimepicker', label: '🕒 選擇開始時間', data: 'PICK_TIME_MEAL_START', mode: 'time' }]
            }
        });
    }

    if (input === 'CMD:GoOut' || input === '我暫時外出') {
        USER_SESSIONS[userId].step = STEPS.SELECT_START_TIME_OUT;
        return client.replyMessage(event.replyToken, {
            type: 'template', altText: '選擇外出時間',
            template: {
                type: 'buttons', text: '🚪 請問您幾點外出？',
                actions: [{ type: 'datetimepicker', label: '🕒 選擇外出時間', data: 'PICK_TIME_OUT_START', mode: 'time' }]
            }
        });
    }

    // B. XỬ LÝ FLOW: XIN NGHỈ (Request Off)
    if (session.step === STEPS.SELECT_DATE_OFF && input.startsWith('PICK_DATE_OFF:')) {
        const dateOff = input.split(':')[1]; // Format: YYYY-MM-DD

        // Gọi hàm update (ưu tiên hàm mới, fallback hàm cũ)
        if (updateScheduleCell) {
            await updateScheduleCell(dateOff, myName, "OFF");
        } else {
            // Fallback logic cũ
            await ghiVaoSheet({
                ngayDen: dateOff, gioDen: '08:00', dichVu: 'OFF_DAY',
                nhanVien: myName, userId: userId, sdt: 'STAFF_APP',
                hoTen: `${myName} (Xin nghỉ)`, trangThai: '⛔ Xin nghỉ', flow: 'BLOCKED', isManualLocked: true
            });
        }

        // Notify Boss
        if (clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `📩 [ĐƠN XIN NGHỈ]\nNV: ${myName}\nNgày: ${dateOff}` });

        USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} }; // Reset
        return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已成功登記請假日期：${dateOff}。` });
    }

    // C. XỬ LÝ FLOW: ĐI TRỄ (Late)
    if (session.step === STEPS.SELECT_DATE_LATE && input.startsWith('PICK_DATE_LATE:')) {
        const dateLate = input.split(':')[1];
        USER_SESSIONS[userId].step = STEPS.SELECT_TIME_LATE;
        USER_SESSIONS[userId].data.date = dateLate;

        // Hiển thị các mốc giờ để chọn (Giả sử ca từ 10:00 - 20:00, tạo slot mỗi 30p)
        return showTimeSlots(event.replyToken, dateLate, "PICK_TIME_LATE");
    }

    if (session.step === STEPS.SELECT_TIME_LATE && input.startsWith('PICK_TIME_LATE:')) {
        const timeLate = input.split(':')[1];
        const dateLate = USER_SESSIONS[userId].data.date;

        if (updateScheduleCell) {
            // Ghi giờ vào ô tương ứng trên Sheet
            await updateScheduleCell(dateLate, myName, timeLate);
        } else {
            // Fallback logic cũ (chỉ hoạt động cho ngày hôm nay)
            await ghiVaoSheet({
                ngayDen: dateLate, gioDen: timeLate, dichVu: `LATE_VAR`,
                nhanVien: myName, userId: userId,
                hoTen: `${myName} (Muộn ${timeLate})`, trangThai: '⚠️ Báo muộn', flow: 'FB'
            });
        }

        if (clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `🏃 [BÁO MUỘN]\nNV: ${myName}\nNgày: ${dateLate}\nGiờ đến: ${timeLate}` });

        USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} };
        return client.replyMessage(event.replyToken, { type: 'text', text: `👌 已通知您將於 ${dateLate} 的 ${timeLate} 抵達。` });
    }

    // D. XỬ LÝ FLOW: ĂN CƠM (Meal Break) - Cột H, I
    if (input === 'PICK_TIME_MEAL_START' && postbackParams && postbackParams.time) {
        const startTime = postbackParams.time;
        USER_SESSIONS[userId].data.startTime = startTime;
        USER_SESSIONS[userId].step = STEPS.SELECT_END_TIME_MEAL;

        // Tính toán gợi ý giờ kết thúc
        const [h, m] = startTime.split(':').map(Number);
        const end30 = formatTime(h, m + 30);
        const end60 = formatTime(h, m + 60);

        return client.replyMessage(event.replyToken, {
            type: 'template', altText: '選擇時間',
            template: {
                type: 'buttons', text: `開始吃飯時間：${startTime}。請問您要吃多久？`,
                actions: [
                    { type: 'postback', label: `30分鐘 (${end30})`, data: `CONFIRM_MEAL:${end30}` },
                    { type: 'postback', label: `60分鐘 (${end60})`, data: `CONFIRM_MEAL:${end60}` }
                ]
            }
        });
    }

    if (input.startsWith('CONFIRM_MEAL:')) {
        const endTime = input.split(':')[1];
        const startTime = USER_SESSIONS[userId].data.startTime;
        const todayStr = normalizeDateStrict(getTaipeiNow());

        if (updateDailyStatus) {
            await updateDailyStatus(myName, todayStr, 'MEAL', startTime, endTime); // Type 'MEAL' -> Col H, I
            return client.replyMessage(event.replyToken, { type: 'text', text: `🍱 已記錄吃飯時間：\n${startTime} - ${endTime}` });
        } else {
            return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 錯誤：未配置 updateDailyStatus 函數。` });
        }
    }

    // E. XỬ LÝ FLOW: RA NGOÀI (Go Out) - Cột J, K
    if (input === 'PICK_TIME_OUT_START' && postbackParams && postbackParams.time) {
        const startTime = postbackParams.time;
        USER_SESSIONS[userId].data.startTime = startTime;
        USER_SESSIONS[userId].step = STEPS.SELECT_END_TIME_OUT;

        return client.replyMessage(event.replyToken, {
            type: 'template', altText: '選擇回來時間',
            template: {
                type: 'buttons', text: `從 ${startTime} 開始外出。請問您何時回來？`,
                actions: [{ type: 'datetimepicker', label: '🕒 選擇回來時間', data: 'PICK_TIME_OUT_END', mode: 'time' }]
            }
        });
    }

    if (input === 'PICK_TIME_OUT_END' && postbackParams && postbackParams.time) {
        const endTime = postbackParams.time;
        const startTime = USER_SESSIONS[userId].data.startTime;
        const todayStr = normalizeDateStrict(getTaipeiNow());

        if (endTime <= startTime) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ 回來時間必須大於外出時間 (${startTime})。請重新選擇。` });
        }

        if (updateDailyStatus) {
            await updateDailyStatus(myName, todayStr, 'OUT', startTime, endTime); // Type 'OUT' -> Col J, K

            // Notify Boss
            if (clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `🚪 [RA NGOÀI]\nNV: ${myName}\n${startTime} - ${endTime}` });

            USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} };
            return client.replyMessage(event.replyToken, { type: 'text', text: `✅ 已記錄暫時外出：\n${startTime} - ${endTime}` });
        }
    }

    // Default response if no match
    return Promise.resolve(null);
}

// --- CÁC HÀM UI HELPER ---

function showMainMenu(replyToken, name) {
    return client.replyMessage(replyToken, {
        type: 'flex', altText: '員工選單',
        contents: {
            "type": "bubble",
            "body": {
                "type": "box", "layout": "vertical", "backgroundColor": "#F9FAFB",
                "contents": [
                    { "type": "text", "text": `你好, ${name} 👋`, "weight": "bold", "size": "lg", "color": "#1DB446", "align": "center" },
                    { "type": "text", "text": "請選擇以下操作：", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" },
                    { "type": "separator", "margin": "md" },
                    {
                        "type": "box", "layout": "vertical", "margin": "lg", "spacing": "md", "contents": [
                            {
                                "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [
                                    { "type": "button", "style": "primary", "color": "#E63946", "height": "sm", "action": { "type": "postback", "label": "⛔ 我要請假", "data": "CMD:RequestOff", "displayText": "我要請假" } },
                                    { "type": "button", "style": "primary", "color": "#F48FB1", "height": "sm", "action": { "type": "postback", "label": "🏃 我會遲到", "data": "CMD:LateOptions", "displayText": "我會遲到" } }
                                ]
                            },
                            {
                                "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [
                                    { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "postback", "label": "🍱 我要吃飯", "data": "CMD:MealBreak", "displayText": "我要吃飯" } },
                                    { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "postback", "label": "🚪 暫時外出", "data": "CMD:GoOut", "displayText": "我暫時外出" } }
                                ]
                            }
                        ]
                    }
                ]
            }
        }
    });
}

// Tạo Flex Calendar hiển thị 30 ngày tới
function showCalendar(replyToken, title, actionPrefix) {
    const bubbles = [];
    const today = new Date();
    // Tạo 30 ngày
    const days = [];
    for (let i = 0; i < 30; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() + i);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; // YYYY-MM-DD
        const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
        const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];

        days.push({
            "type": "button",
            "style": "secondary",
            "height": "sm",
            "margin": "xs",
            "action": { "type": "postback", "label": `${dayLabel} (${weekday})`, "data": `${actionPrefix}:${dateStr}`, "displayText": `${dayLabel} (${weekday})` }
        });
    }

    // Chia thành các trang (mỗi trang 12 nút)
    const chunkSize = 12;
    for (let i = 0; i < days.length; i += chunkSize) {
        const chunk = days.slice(i, i + chunkSize);
        // Nhóm thành hàng ngang (3 nút/hàng)
        const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            rows.push({
                "type": "box", "layout": "horizontal", "spacing": "xs", "margin": "xs",
                "contents": chunk.slice(j, j + 3)
            });
        }

        bubbles.push({
            "type": "bubble",
            "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": title, "weight": "bold", "color": "#ffffff" }], "backgroundColor": "#007BFF" },
            "body": { "type": "box", "layout": "vertical", "contents": rows }
        });
    }

    return client.replyMessage(replyToken, {
        type: 'flex', altText: '選擇日期',
        contents: { type: 'carousel', contents: bubbles }
    });
}

// Tạo Time Slots (Ví dụ từ 10:00 đến 20:00)
function showTimeSlots(replyToken, dateStr, actionPrefix) {
    const times = [];
    // Tạo slot 10h -> 20h
    for (let h = 10; h <= 20; h++) {
        times.push(`${h < 10 ? '0' + h : h}:00`);
        times.push(`${h < 10 ? '0' + h : h}:30`);
    }

    const buttons = times.map(t => ({
        "type": "button", "style": "secondary", "height": "sm", "margin": "xs", "flex": 1,
        "action": { "type": "postback", "label": t, "data": `${actionPrefix}:${t}`, "displayText": t }
    }));

    // Chia nhỏ để hiển thị đẹp (4 nút/hàng)
    const rows = [];
    for (let i = 0; i < buttons.length; i += 4) {
        rows.push({
            "type": "box", "layout": "horizontal", "spacing": "xs", "margin": "xs",
            "contents": buttons.slice(i, i + 4)
        });
    }

    return client.replyMessage(replyToken, {
        type: 'flex', altText: '選擇時間',
        contents: {
            "type": "bubble",
            "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": `${dateStr} 的抵達時間`, "weight": "bold" }] },
            "body": { "type": "box", "layout": "vertical", "contents": rows }
        }
    });
}

// Helper: Format giờ (10, 30 -> "10:30")
function formatTime(h, m) {
    if (m >= 60) { h += Math.floor(m / 60); m = m % 60; }
    if (h >= 24) h = h % 24;
    return `${h < 10 ? '0' + h : h}:${m < 10 ? '0' + m : m}`;
}

module.exports = {
    config,
    middleware: line.middleware,
    handleEvent,
    client
};