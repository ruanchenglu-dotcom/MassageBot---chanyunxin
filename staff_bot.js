// staff_bot.js
const line = require('@line/bot-sdk');

// 1. CẤU HÌNH RIÊNG CHO STAFF BOT
const config = {
    channelAccessToken: process.env.STAFF_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.STAFF_CHANNEL_SECRET
};

const client = new line.Client(config);

// Bộ nhớ tạm xác thực (Map: UserId -> Tên Nhân Viên)
let STAFF_BINDING = {}; 

// 2. HÀM XỬ LÝ CHÍNH (Được gọi từ index.js)
// context bao gồm: { ghiVaoSheet, normalizeDateStrict, getTaipeiNow, formatDateTimeString, STAFF_LIST }
async function handleEvent(event, context) {
    const { ghiVaoSheet, normalizeDateStrict, getTaipeiNow, formatDateTimeString, STAFF_LIST, ID_BA_CHU, clientMain } = context;
    
    const userId = event.source.userId;
    const isText = event.type === 'message' && event.message.type === 'text';
    const isPostback = event.type === 'postback';

    if (!isText && !isPostback) return Promise.resolve(null);

    let text = '';
    if (isText) text = event.message.text.trim();
    else if (isPostback) {
        if (event.postback.params && event.postback.params.date) text = `StaffPickDate:${event.postback.params.date}`; 
        else text = event.postback.data;
    }

    // --- LOGIC 1: XÁC THỰC DANH TÍNH ---
    if (!STAFF_BINDING[userId] && !text.startsWith('Bind:')) {
        const bubbles = createStaffBubblesForAuth(STAFF_LIST);
        return client.replyMessage(event.replyToken, {
            type: 'flex', altText: 'Vui lòng xác nhận danh tính',
            contents: { type: 'carousel', contents: bubbles }
        });
    }

    if (text.startsWith('Bind:')) {
        const staffName = text.split(':')[1];
        STAFF_BINDING[userId] = staffName;
        return client.replyMessage(event.replyToken, { type: 'text', text: `✅ Xác nhận: Bạn là ${staffName}.\nMenu đã sẵn sàng.` });
    }

    const myName = STAFF_BINDING[userId];

    // --- LOGIC 2: MENU ---
    if (text.toLowerCase() === 'menu' || text === 'Help') {
        return client.replyMessage(event.replyToken, {
            type: 'flex', altText: 'Menu Nhân Viên',
            contents: {
                "type": "bubble",
                "body": {
                    "type": "box", "layout": "vertical", "backgroundColor": "#F9FAFB", 
                    "contents": [
                        { "type": "text", "text": `Xin chào, ${myName} 👋`, "weight": "bold", "size": "lg", "color": "#1DB446", "align": "center" },
                        { "type": "separator", "margin": "md" },
                        { "type": "box", "layout": "vertical", "margin": "lg", "spacing": "sm", "contents": [
                            { "type": "button", "style": "primary", "color": "#E63946", "height": "sm", "action": { "type": "message", "label": "⛔ Xin Nghỉ (Off)", "text": "StaffAct:RequestOff" } },
                            { "type": "button", "style": "primary", "color": "#F48FB1", "height": "sm", "action": { "type": "message", "label": "🏃 Báo Muộn (Late)", "text": "StaffAct:LateOptions" } }
                        ]}
                    ]
                }
            }
        });
    }

    // --- LOGIC 3: XIN NGHỈ ---
    if (text === 'StaffAct:RequestOff') {
        const today = normalizeDateStrict(getTaipeiNow());
        return client.replyMessage(event.replyToken, {
            type: 'template', altText: 'Chọn ngày nghỉ',
            template: {
                type: 'buttons', text: `Bạn muốn xin nghỉ ngày nào?`,
                actions: [
                    { type: 'message', label: `Hôm nay (${today})`, text: `DoOff:${today}` },
                    { type: 'datetimepicker', label: '📅 Chọn ngày khác', data: 'IgnoreThis', mode: 'date' }
                ]
            }
        });
    }
    
    if (text.startsWith('StaffPickDate:')) {
        text = `DoOff:${normalizeDateStrict(text.split(':')[1])}`;
    }

    if (text.startsWith('DoOff:')) {
        const dateOff = text.split(':')[1];
        await ghiVaoSheet({
            ngayDen: dateOff, gioDen: '08:00', dichVu: 'OFF_DAY',
            nhanVien: myName, userId: userId, sdt: 'STAFF_APP',
            hoTen: `${myName} (Xin nghỉ)`, trangThai: '⛔ Xin nghỉ', flow: 'BLOCKED', isManualLocked: true
        });
        
        // Báo cho bà chủ (dùng clientMain truyền từ index.js sang)
        if(clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `📩 [ĐƠN XIN NGHỈ]\nNV: ${myName}\nNgày: ${dateOff}` });
        
        return client.replyMessage(event.replyToken, { type: 'text', text: `✅ Đã đăng ký nghỉ ngày ${dateOff}.` });
    }

    // --- LOGIC 4: BÁO MUỘN ---
    if (text === 'StaffAct:LateOptions') {
        return client.replyMessage(event.replyToken, {
            type: 'flex', altText: 'Late Options',
            contents: {
                "type": "bubble",
                "body": {
                    "type": "box", "layout": "vertical", "contents": [
                        { "type": "text", "text": "Đến muộn bao lâu?", "weight": "bold", "align": "center" },
                        { "type": "box", "layout": "horizontal", "margin": "md", "spacing": "sm", "contents": [
                            { "type": "button", "style": "secondary", "action": { "type": "message", "label": "15p", "text": "DoLate:15" } },
                            { "type": "button", "style": "secondary", "action": { "type": "message", "label": "30p", "text": "DoLate:30" } },
                            { "type": "button", "style": "secondary", "action": { "type": "message", "label": "60p", "text": "DoLate:60" } }
                        ]}
                    ]
                }
            }
        });
    }

    if (text.startsWith('DoLate:')) {
        const mins = text.split(':')[1];
        const now = getTaipeiNow();
        const timeStr = formatDateTimeString(now).split(' ')[1];
        const todayISO = normalizeDateStrict(now);

        await ghiVaoSheet({
            ngayDen: todayISO, gioDen: timeStr, dichVu: `LATE_${mins}M`,
            nhanVien: myName, userId: userId, sdt: 'STAFF_APP',
            hoTen: `${myName} (Muộn ${mins}p)`, trangThai: '⚠️ Báo muộn', flow: 'FB'
        });

        if(clientMain) clientMain.pushMessage(ID_BA_CHU, { type: 'text', text: `🏃 [BÁO MUỘN]\nNV: ${myName}\nMuộn: ${mins} phút.` });
        return client.replyMessage(event.replyToken, { type: 'text', text: `👌 Đã báo muộn ${mins} phút.` });
    }
}

// Helper: Tạo bong bóng chọn tên (cần danh sách STAFF_LIST từ index.js)
function createStaffBubblesForAuth(staffList) {
    if (!staffList || staffList.length === 0) return [{ "type": "bubble", "body": { "type": "box", "layout": "vertical", "contents": [{ "type": "text", "text": "No Data", "align": "center" }] } }];
    
    const bubbles = []; const chunkSize = 12;
    const cleanList = staffList.filter(s => s.id && s.id !== '随機');

    for (let i = 0; i < cleanList.length; i += chunkSize) {
        const chunk = cleanList.slice(i, i + chunkSize); const rows = [];
        for (let j = 0; j < chunk.length; j += 3) {
            const rowItems = chunk.slice(j, j + 3);
            const rowButtons = rowItems.map(s => ({
                "type": "button", "style": "secondary", "height": "sm", "margin": "xs", "flex": 1,
                "action": { "type": "message", "label": s.name, "text": `Bind:${s.id}` }
            }));
            rows.push({ "type": "box", "layout": "horizontal", "spacing": "xs", "contents": rowButtons });
        }
        bubbles.push({
            "type": "bubble", "body": {
                "type": "box", "layout": "vertical", "contents": [
                    { "type": "text", "text": "🔐 XÁC THỰC", "weight": "bold", "align": "center", "color": "#E63946" },
                    { "type": "separator", "margin": "md" }, ...rows
                ]
            }
        });
    }
    return bubbles;
}

// Xuất các hàm cần thiết để index.js dùng
module.exports = {
    config,
    middleware: line.middleware,
    handleEvent
};