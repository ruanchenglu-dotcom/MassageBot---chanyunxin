const crypto = require('crypto');
const http = require('http');

async function sendWebhook(dataString) {
    const channelSecret = '4a2a3e84c50b9a164c72b773c38a68ca';
    const body = JSON.stringify({
        events: [
            {
                type: 'postback',
                replyToken: '00000000000000000000000000000000',
                source: {
                    userId: 'U_TEST_USER_12345',
                    type: 'user'
                },
                timestamp: Date.now(),
                postback: {
                    data: dataString
                }
            }
        ]
    });

    const signature = crypto.createHmac('SHA256', channelSecret).update(body).digest('base64');

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 5001,
            path: '/callback',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-line-signature': signature,
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function run() {
    console.log("=== BẮT ĐẦU KIỂM THỬ E2E (WEBHOOK LINE) ===");
    
    console.log("\\n1. Gửi Action:Booking");
    let res = await sendWebhook('Action:Booking');
    console.log('Result:', res.status, res.data);

    // Chờ 2 giây để server cập nhật state
    await new Promise(r => setTimeout(r, 2000));

    console.log("\\n2. Chọn dịch vụ: Cat:COMBO");
    res = await sendWebhook('Cat:COMBO');
    console.log('Result:', res.status, res.data);

    await new Promise(r => setTimeout(r, 2000));

    // Lấy ngày hôm nay
    const today = new Date();
    today.setHours(today.getHours() + 8); // Asia/Taipei
    const dateStr = `${today.getFullYear()}/${(today.getMonth()+1).toString().padStart(2, '0')}/${today.getDate().toString().padStart(2, '0')}`;
    console.log(`\\n3. Chọn ngày hôm nay: Date:${dateStr}`);
    res = await sendWebhook(`Date:${dateStr}`);
    console.log('Result:', res.status, res.data);

    await new Promise(r => setTimeout(r, 2000));

    console.log("\n4. Gửi Action:MyBooking (Tra cứu lịch hẹn)");
    res = await sendWebhook('Action:MyBooking');
    console.log('Result:', res.status, res.data);

    console.log("\n=== KẾT THÚC KIỂM THỬ ===");
    process.exit(0);
}

run();
