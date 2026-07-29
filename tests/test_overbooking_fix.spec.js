const { test, expect } = require('@playwright/test');

test.describe('Bug Fix - Overbooking Capacity Issue', () => {
    test('Should block new bookings when staff capacity is exceeded (unassigned & combo constraints)', async ({ request }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        let createdRows = [];

        console.log(`Creating Group A bookings at 08:00 (Combo 100 mins)...`);
        // We simulate a booking of 8 guests at 08:00 for a 100-minute Combo service
        // Since they are unassigned ("隨機"), they should consume 8 staff members
        const createGroupA = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                hoTen: `Test Group A`,
                sdt: "0999888777",
                pax: 30,
                dichVu: "套餐 (100分)", 
                duration: 100,
                location: "本館",
                ngayDen: dateStr,
                gioDen: "08:00",
                type: "GROUP",
                guests: Array.from({ length: 30 }, () => ({ category: "COMBO", flow: "BF", duration: 100, staff: "隨機" })),
                flow: "BF",
                status: "NEW"
            }
        });

        const resDataA = await createGroupA.json();
        if (createGroupA.ok()) {
            if (Array.isArray(resDataA.rows)) {
                resDataA.rows.forEach(r => createdRows.push(r.rowId));
            } else if (resDataA.rowId) {
                createdRows.push(resDataA.rowId);
            }
        }

        console.log(`Attempting to create Group B bookings at 09:00 (Overbooking)...`);
        // We simulate another booking of 6 guests at 09:00 for a 100-minute Combo service
        // This overlaps with Group A (which runs until 09:40)
        // With 8 staff busy, and trying to book 6 more, it should definitively trigger a capacity failure!
        const createGroupB = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                hoTen: `Test Group B`,
                sdt: "0999888777",
                pax: 30,
                dichVu: "套餐 (100分)", 
                duration: 100,
                location: "本館",
                ngayDen: dateStr,
                gioDen: "09:00",
                type: "GROUP",
                guests: Array.from({ length: 30 }, () => ({ category: "COMBO", flow: "BF", duration: 100, staff: "隨機" })),
                flow: "BF",
                status: "NEW"
            }
        });

        const textRes = await createGroupB.text();
        console.log("Group B Result:", textRes);
        let resDataB = {};
        try {
           resDataB = JSON.parse(textRes);
        } catch (e) {}
        
        // Assert that Group B FAILS due to lack of staff (since overbooking bug is fixed)
        expect(createGroupB.ok()).toBeFalsy();
        const reason = resDataB.error || resDataB.reason || textRes;
        expect(reason).toContain('技師總數不足');

        // Cleanup
        console.log("Cleaning up test data...");
        for (const rowId of createdRows) {
            await request.post('http://localhost:5001/api/update-status', {
                data: { rowId: rowId, status: "CANCEL" }
            });
        }
    });
});
