const StaffBot = require('./cyx_staff_bot');

async function runTests() {
    console.log("=== BẮT ĐẦU TEST STAFF BOT TIẾNG TRUNG ===");

    // Mock dependencies
    const mockContext = {
        findStaffRowByLineId: async (userId) => {
            if (userId === 'VALID_USER') return { name: 'Thợ Test' };
            return null; // Invalid user
        },
        updateScheduleCell: async () => {},
        updateDailyStatus: async () => {},
        clientMain: { pushMessage: () => {} },
        ID_BA_CHU: 'BOSS',
        getTaipeiNow: () => new Date(),
        normalizeDateStrict: () => '2026-07-28'
    };

    // Override client.replyMessage
    let lastReply = null;
    StaffBot.client.replyMessage = async (replyToken, message) => {
        lastReply = message;
    };

    // Helper để test từng input
    async function testInput(textInput, expectedType, expectedTextFragment) {
        lastReply = null;
        await StaffBot.handleEvent({
            type: 'message',
            replyToken: 'token123',
            source: { userId: 'VALID_USER' },
            message: { type: 'text', text: textInput }
        }, mockContext);

        if (!lastReply) {
            console.log(`❌ FAIL [${textInput}]: Không có phản hồi.`);
            return;
        }

        const isTypeMatch = lastReply.type === expectedType;
        let isContentMatch = false;
        
        if (expectedType === 'text') {
            isContentMatch = lastReply.text.includes(expectedTextFragment);
        } else if (expectedType === 'flex' || expectedType === 'template') {
            isContentMatch = JSON.stringify(lastReply).includes(expectedTextFragment);
        }

        if (isTypeMatch && isContentMatch) {
            console.log(`✅ PASS [${textInput}] -> Nhận đúng phản hồi (${expectedType}).`);
        } else {
            console.log(`❌ FAIL [${textInput}]: Phản hồi không khớp.\n   - Nhận được: ${JSON.stringify(lastReply)}\n   - Mong đợi: chứa "${expectedTextFragment}"`);
        }
    }

    // 1. Test Menu
    await testInput('選單', 'flex', '員工選單');
    
    // 2. Test Các Tính Năng
    await testInput('我要請假', 'flex', '請選擇請假日期');
    await testInput('我會遲到', 'flex', '請問您哪天會遲到');
    await testInput('我要吃飯', 'template', '請問您幾點開始吃飯');
    await testInput('我暫時外出', 'template', '請問您幾點外出');

    // 3. Test Invalid User
    lastReply = null;
    await StaffBot.handleEvent({
        type: 'message',
        replyToken: 'token123',
        source: { userId: 'INVALID_USER' },
        message: { type: 'text', text: '我要請假' }
    }, mockContext);
    
    if (lastReply && lastReply.text.includes('您的帳號尚未綁定')) {
        console.log(`✅ PASS [Invalid User] -> Nhận đúng thông báo từ chối.`);
    } else {
        console.log(`❌ FAIL [Invalid User]: Không chặn user.`);
    }

    console.log("=== KẾT THÚC TEST ===");
}

runTests().catch(console.error);
