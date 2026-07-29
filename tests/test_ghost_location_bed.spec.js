const { test, expect } = require('@playwright/test');

test.describe('Bug Fix - Ghost Location (Bed/Chair conflict between shops)', () => {
    test('Should NOT block beds in Main Shop when Opposite Shop has a guest with location set to BED-2-4', async ({ request }) => {
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        let createdRows = [];

        console.log(`Creating a guest in 對面館 (Opposite Shop) at 10:00...`);
        const createOpposite = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: false,
                hoTen: `Ghost Guest (Opposite)`,
                sdt: "0911222333",
                dichVu: "指壓 (60分)", 
                duration: 60,
                location: "對面館", // Opposite shop
                ngayDen: dateStr,
                gioDen: "10:00",
                type: "SINGLE",
                flow: "BODYSINGLE",
                status: "NEW"
            }
        });

        const resDataOpp = await createOpposite.json();
        let oppRowId = resDataOpp.rowId || (resDataOpp.rows && resDataOpp.rows[0].rowId);
        if (oppRowId) createdRows.push(oppRowId);

        console.log(`Simulating Ghost Location by setting guest's location to BED-2-4...`);
        // We simulate the system assigning "BED-2-4" to the location column
        await request.post('http://localhost:5001/api/inline-update-booking', {
            data: {
                rowId: oppRowId,
                location: "BED-2-4",
                current_resource_id: "BED-2-4"
            }
        });

        console.log(`Attempting to create 6 guests in 本館 (Main Shop) at 10:00...`);
        // Main Shop has exactly 6 Beds.
        // If the ghost location bug exists, BED-2-4 from Opposite Shop will be incorrectly parsed as BED-1-4 in Main Shop.
        // This would cause one bed to be "occupied" and this booking of 6 guests would FAIL.
        // With our fix, it should PASS.
        const createMain = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: true,
                hoTen: `Main Guests`,
                sdt: "0999888777",
                pax: 6,
                dichVu: "指壓 (60分)", 
                duration: 60,
                location: "本館", // Main shop
                ngayDen: dateStr,
                gioDen: "10:00",
                type: "GROUP",
                guests: Array.from({ length: 6 }, () => ({ category: "BODY", flow: "BODYSINGLE", duration: 60, staff: "隨機" })),
                flow: "BODYSINGLE",
                status: "NEW"
            }
        });

        const textRes = await createMain.text();
        console.log("Main Shop Result:", textRes);
        let resDataMain = {};
        try {
           resDataMain = JSON.parse(textRes);
        } catch (e) {}

        if (resDataMain.rows) {
            resDataMain.rows.forEach(r => createdRows.push(r.rowId));
        } else if (resDataMain.rowId) {
            createdRows.push(resDataMain.rowId);
        }

        // Assert that the booking SUCCEEDS because physical resources are isolated
        expect(createMain.ok()).toBeTruthy();
        expect(resDataMain.success).toBeTruthy();

        // Cleanup
        console.log("Cleaning up test data...");
        for (const rowId of createdRows) {
            await request.post('http://localhost:5001/api/update-status', {
                data: { rowId: rowId, status: "CANCEL" }
            });
        }
    });
});
