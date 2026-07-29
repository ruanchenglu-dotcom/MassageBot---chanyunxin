const { test, expect } = require('@playwright/test');

test.describe('Bug Fix - Cross-Location Staff Capacity (Shared Pool)', () => {
    test('Should block new bookings in Opposite Shop when Main Shop staff is fully occupied', async ({ request }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        let createdRows = [];

        console.log(`Creating Group A bookings in 本館 (Main Shop) at 08:00 (Combo 100 mins)...`);
        // We simulate a booking of 30 guests at 08:00 for a 100-minute Combo service
        // Since they are unassigned ("隨機"), they should consume 30 staff members (which exhausts the system)
        const createGroupA = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                hoTen: `Test Group A (Main)`,
                sdt: "0999888777",
                pax: 30,
                dichVu: "套餐 (100分)", 
                duration: 100,
                location: "本館", // Main shop
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

        console.log(`Attempting to create Group B bookings in 對面館 (Opposite Shop) at 09:00 (Overbooking)...`);
        // We simulate another booking of 30 guests at 09:00 for a 100-minute Combo service
        // BUT this time in the OPPOSITE shop ("對面館").
        // Staff are shared, so the 30 staff busy at "本館" should prevent this booking!
        const createGroupB = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                hoTen: `Test Group B (Opposite)`,
                sdt: "0999888777",
                pax: 30,
                dichVu: "套餐 (100分)", 
                duration: 100,
                location: "對面館", // Opposite shop
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
        
        // Assert that Group B FAILS due to lack of staff (since cross-location bug is fixed)
        expect(createGroupB.ok()).toBeFalsy();
        const reason = resDataB.error || resDataB.reason || textRes;
        expect(reason).toContain('技師總數不足'); // Insufficient staff

        // Cleanup
        console.log("Cleaning up test data...");
        for (const rowId of createdRows) {
            await request.post('http://localhost:5001/api/update-status', {
                data: { rowId: rowId, status: "CANCEL" }
            });
        }
    });
});
