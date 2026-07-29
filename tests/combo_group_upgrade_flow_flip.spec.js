const { test, expect } = require('@playwright/test');

test.describe('Combo Group Upgrade Flow Flip Backend Test', () => {
    test('Nâng cấp nhóm 6 khách từ FOOT lên COMBO, 3 người tự động đảo luồng BF', async ({ request, page }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        const createdRows = [];

        // 1. Tạo 6 người FOOT
        for (let i = 0; i < 6; i++) {
            const createRes = await request.post('http://localhost:5001/api/admin-booking', {
                data: {
                    is_group_booking: false,
                    name: `Group Test ${i}`,
                    phone: "0999999999",
                    guestCount: 1,
                    service_code: "A1",
                    serviceName: '腳底按摩 (40m)',
                    duration: 40,
                    location: "本館",
                    date: dateStr,
                    startTime: "12:00",
                    type: "SINGLE",
                    guests: [{ category: "FOOT", flow: "FOOTSINGLE", duration: 40 }],
                    flow: "FOOTSINGLE",
                    status: "預約中",
                    group_id: "test-group-999"
                }
            });
            const resData = await createRes.json();
            console.log("Create booking response:", resData);
            if (resData.success === false) console.log("Failed to create booking:", resData);
            if (resData.rowId) createdRows.push(resData.rowId);
            else if (resData.data && resData.data.rowId) createdRows.push(resData.data.rowId);
        }

        console.log("Created rows: ", createdRows);
        expect(createdRows.length).toBe(6);

        // 2. Tạo 9 booking chiếm BED cùng khung giờ 12:40 (khi Phase 2 của FB bắt đầu)
        for (let i = 0; i < 9; i++) {
            await request.post('http://localhost:5001/api/admin-booking', {
                data: {
                    is_group_booking: false,
                    name: `Blocker ${i}`,
                    phone: "0999999999",
                    guestCount: 1,
                    service_code: "B1",
                    serviceName: '全身按摩 (60m)',
                    duration: 60,
                    location: "本館",
                    date: dateStr,
                    startTime: "12:40",
                    type: "SINGLE",
                    guests: [{ category: "BODY", flow: "BODYSINGLE", duration: 60 }],
                    flow: "BODYSINGLE",
                    status: "預約中"
                }
            });
        }

        // 3. Tiến hành nâng cấp nhóm 6 người lên Combo thông qua inline-update-group
        const updatedData = {
            dichVu: '套餐(腳+身) 100分',
            duration: 100,
            phase1_duration: 50,
            phase2_duration: 50,
            flow: 'FB',
            ignoreOverlap: true
        };

        const updateRes = await request.post('http://localhost:5001/api/inline-update-group', {
            data: {
                rowIds: createdRows,
                updatedData: updatedData
            }
        });

        const updateResData = await updateRes.json();
        expect(updateResData.success).toBe(true);

        // 4. Lấy lại dữ liệu từ API /api/info (thay vì /api/bookings)
        const infoRes = await request.get(`http://localhost:5001/api/info?date=${dateStr}`);
        const infoData = await infoRes.json();
        
        const groupBookings = infoData.data.filter(b => createdRows.includes(String(b.rowId)) || createdRows.includes(Number(b.rowId)));
        expect(groupBookings.length).toBe(6);

        let fbCount = 0;
        let bfCount = 0;
        let missingPhase2Count = 0;

        groupBookings.forEach(b => {
            if (b.flow === 'FB') fbCount++;
            if (b.flow === 'BF') bfCount++;
            if (!b.phase2_res_idx || b.phase2_res_idx.trim() === '') {
                missingPhase2Count++;
            }
        });

        console.log(`FB Count: ${fbCount}, BF Count: ${bfCount}, Missing Phase 2: ${missingPhase2Count}`);
        
        // Tất cả 6 khách đều phải có phase 2
        expect(missingPhase2Count).toBe(0);

        // Do đã cố tình block 9 cái BED ở 12:40, 6 khách này KHÔNG THỂ cùng đi theo flow FB
        // Chắc chắn phải có người đi luồng BF
        expect(bfCount).toBeGreaterThan(0);
        expect(fbCount).toBeGreaterThan(0);

        // Đi đến trang chủ UI để confirm
        await page.goto('http://localhost:5001/XinWuChanAdmin/');
        await page.waitForLoadState('networkidle');
        await page.waitForSelector('.booking-card');
    });
});
