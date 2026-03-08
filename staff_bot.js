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
            text: `⛔ Tài khoản chưa được liên kết.\n\nVui lòng copy và gửi ID này cho quản lý để thêm vào hệ thống:\n\n${userId}`
        });
    }

    const myName = staffInfo.name;

    // Khởi tạo session nếu chưa có
    if (!USER_SESSIONS[userId]) USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} };
    const session = USER_SESSIONS[userId];

    // --- LOGIC 2: ĐIỀU HƯỚNG MENU CHÍNH ---
    if (input.toLowerCase() === 'menu' || input === 'Help' || input === 'reset') {
        USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} }; // Reset trạng thái
        return showMainMenu(event.replyToken, myName);
    }

    // --- LOGIC 3: XỬ LÝ THEO TRẠNG THÁI & INPUT ---

    // A. MENU COMMANDS (Khi đang rảnh hoặc người dùng bấm menu)
    if (input === 'CMD:RequestOff') {
        USER_SESSIONS[userId].step = STEPS.SELECT_DATE_OFF;
        return showCalendar(event.replyToken, "📅 Chọn ngày muốn nghỉ:", "PICK_DATE_OFF");
    }

    if (input === 'CMD:LateOptions') {
        USER_SESSIONS[userId].step = STEPS.SELECT_DATE_LATE;
        return showCalendar(event.replyToken, "📅 Bạn đi trễ ngày nào?", "PICK_DATE_LATE");
    }

    if (input === 'CMD:MealBreak') {
        USER_SESSIONS[userId].step = STEPS.SELECT_START_TIME_MEAL;
        return client.replyMessage(event.replyToken, {
            type: 'template', altText: 'Chọn giờ ăn',
            template: {
                type: 'buttons', text: '🍱 Bạn bắt đầu ăn lúc mấy giờ?',
                actions: [{ type: 'datetimepicker', label: '🕒 Chọn giờ bắt đầu', data: 'PICK_TIME_MEAL_START', mode: 'time' }]
            }
        });
    }

    if (input === 'CMD:GoOut') {
        USER_SESSIONS[userId].step = STEPS.SELECT_START_TIME_OUT;
        return client.replyMessage(event.replyToken, {
            type: 'template', altText: 'Chọn giờ ra ngoài',
            template: {
                type: 'buttons', text: '🚪 Bạn ra ngoài lúc mấy giờ?',
                actions: [{ type: 'datetimepicker', label: '🕒 Chọn giờ đi', data: 'PICK_TIME_OUT_START', mode: 'time' }]
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
        return client.replyMessage(event.replyToken, { type: 'text', text: `✅ Đã đăng ký nghỉ ngày ${dateOff}.` });
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
        return client.replyMessage(event.replyToken, { type: 'text', text: `👌 Đã báo sẽ đến lúc ${timeLate} ngày ${dateLate}.` });
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
            type: 'template', altText: 'Chọn thời gian ăn',
            template: {
                type: 'buttons', text: `Bắt đầu ăn: ${startTime}. Ăn trong bao lâu?`,
                actions: [
                    { type: 'postback', label: `30 phút (${end30})`, data: `CONFIRM_MEAL:${end30}` },
                    { type: 'postback', label: `60 phút (${end60})`, data: `CONFIRM_MEAL:${end60}` }
                ]
            }
        });
    }

    if (input.startsWith('CONFIRM_MEAL:')) {
        const endTime = input.split(':')[1];
        const startTime = USER_SESSIONS[userId].data.startTime;
        const todayStr = normalizeDateStrict(getTaipeiNow());

        // Gọi hàm updateDailyStatus (Cần có trong context)
        if (updateDailyStatus) {
            await updateDailyStatus(myName, todayStr, 'MEAL', startTime, endTime); // Type 'MEAL' -> Col H, I
            return client.replyMessage(event.replyToken, { type: 'text', text: `🍱 Đã ghi nhận ăn cơm:\n${startTime} - ${endTime}` });
        } else {
            return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ Lỗi: Chưa cấu hình hàm updateDailyStatus.` });
        }
    }

    // E. XỬ LÝ FLOW: RA NGOÀI (Go Out) - Cột J, K
    if (input === 'PICK_TIME_OUT_START' && postbackParams && postbackParams.time) {
        const startTime = postbackParams.time;
        USER_SESSIONS[userId].data.startTime = startTime;
        USER_SESSIONS[userId].step = STEPS.SELECT_END_TIME_OUT;

        return client.replyMessage(event.replyToken, {
            type: 'template', altText: 'Chọn giờ về',
            template: {
                type: 'buttons', text: `Ra ngoài từ: ${startTime}. Khi nào bạn quay lại?`,
                actions: [{ type: 'datetimepicker', label: '🕒 Chọn giờ về', data: 'PICK_TIME_OUT_END', mode: 'time' }]
            }
        });
    }

    if (input === 'PICK_TIME_OUT_END' && postbackParams && postbackParams.time) {
        const endTime = postbackParams.time;
        const startTime = USER_SESSIONS[userId].data.startTime;
        const todayStr = normalizeDateStrict(getTaipeiNow());

        // Validate cơ bản
        if (endTime <= startTime) {
            return client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ Giờ về phải lớn hơn giờ đi (${startTime}). Vui lòng chọn lại.` });
        }

        if (updateDailyStatus) {
            await updateDailyStatus(myName, todayStr, 'OUT', startTime, endTime); // Type 'OUT' -> Col J, K

            // Notify Boss
            if (clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `🚪 [RA NGOÀI]\nNV: ${myName}\n${startTime} - ${endTime}` });

            USER_SESSIONS[userId] = { step: STEPS.IDLE, data: {} };
            return client.replyMessage(event.replyToken, { type: 'text', text: `✅ Đã ghi nhận ra ngoài:\n${startTime} - ${endTime}` });
        }
    }

    // Default response if no match
    return Promise.resolve(null);
}

// --- CÁC HÀM UI HELPER ---

function showMainMenu(replyToken, name) {
    return client.replyMessage(replyToken, {
        type: 'flex', altText: 'Menu Nhân Viên',
        contents: {
            "type": "bubble",
            "body": {
                "type": "box", "layout": "vertical", "backgroundColor": "#F9FAFB",
                "contents": [
                    { "type": "text", "text": `Xin chào, ${name} 👋`, "weight": "bold", "size": "lg", "color": "#1DB446", "align": "center" },
                    { "type": "text", "text": "Chọn thao tác bên dưới:", "size": "xs", "color": "#aaaaaa", "align": "center", "margin": "sm" },
                    { "type": "separator", "margin": "md" },
                    {
                        "type": "box", "layout": "vertical", "margin": "lg", "spacing": "md", "contents": [
                            {
                                "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [
                                    { "type": "button", "style": "primary", "color": "#E63946", "height": "sm", "action": { "type": "postback", "label": "⛔ Xin Nghỉ", "data": "CMD:RequestOff" } },
                                    { "type": "button", "style": "primary", "color": "#F48FB1", "height": "sm", "action": { "type": "postback", "label": "🏃 Đi Trễ", "data": "CMD:LateOptions" } }
                                ]
                            },
                            {
                                "type": "box", "layout": "horizontal", "spacing": "sm", "contents": [
                                    { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "postback", "label": "🍱 Ăn Cơm", "data": "CMD:MealBreak" } },
                                    { "type": "button", "style": "secondary", "height": "sm", "action": { "type": "postback", "label": "🚪 Ra Ngoài", "data": "CMD:GoOut" } }
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
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayLabel = `${d.getDate()}/${d.getMonth() + 1}`;
        const weekday = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()];

        days.push({
            "type": "button",
            "style": "secondary",
            "height": "sm",
            "margin": "xs",
            "action": { "type": "postback", "label": `${dayLabel} (${weekday})`, "data": `${actionPrefix}:${dateStr}` }
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
        type: 'flex', altText: 'Chọn ngày',
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
        "action": { "type": "postback", "label": t, "data": `${actionPrefix}:${t}` }
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
        type: 'flex', altText: 'Chọn giờ',
        contents: {
            "type": "bubble",
            "header": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": `Giờ đến ngày ${dateStr}`, "weight": "bold" }] },
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

// Xuất module
module.exports = {
    config,
    middleware: line.middleware,
    handleEvent
};