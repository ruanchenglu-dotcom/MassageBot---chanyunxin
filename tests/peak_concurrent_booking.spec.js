const { test, expect } = require('@playwright/test');

test.describe('Bug Fix - Peak Concurrent Worker Availability', () => {
    test('Should calculate concurrent staff usage instead of summing overlapping bookings', async ({ request }) => {
        // First get system state to find available staff
        // Find staff capacity
        const totalStaffCount = 13;
        console.log(`Total staff available in system: ${totalStaffCount}`);
        console.log(`Total staff available in system: ${totalStaffCount}`);

        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        
        let createdRows = [];

        // Scenario:
        const groupACount = totalStaffCount - 1;
        
        if (groupACount > 0) {
            console.log(`Creating ${groupACount} Group A bookings...`);
            for (let i = 0; i < groupACount; i++) {
                const createRes = await request.post('http://localhost:5001/api/admin-booking', {
                    data: {
                        is_group_booking: false,
                        name: `Group A ${i}`,
                        phone: "123456",
                        guestCount: 1,
                        service_code: "60", // Assume 60 mins duration logic mapped by code, we force duration below
                        duration: 75,
                        location: "本館",
                        date: dateStr,
                        startTime: "10:00",
                        type: "SINGLE",
                        guests: [{ category: "SINGLE", flow: "M", duration: 75 }],
                        flow: "M",
                        status: "NEW"
                    }
                });
                const resData = await createRes.json();
                if (resData.rowId) createdRows.push(resData.rowId);
                else if (resData.data && resData.data.rowId) createdRows.push(resData.data.rowId);
            }
        }

        console.log(`Creating 2 Group B bookings...`);
        for (let i = 0; i < 2; i++) {
            const createRes = await request.post('http://localhost:5001/api/admin-booking', {
                data: {
                    is_group_booking: false,
                    name: `Group B ${i}`,
                    phone: "123456",
                    guestCount: 1,
                    service_code: "60",
                    duration: 60,
                    location: "本館",
                    date: dateStr,
                    startTime: "11:15",
                    type: "SINGLE",
                    guests: [{ category: "SINGLE", flow: "M", duration: 60 }],
                    flow: "M",
                    status: "NEW"
                }
            });
            const resData = await createRes.json();
            if (resData.rowId) createdRows.push(resData.rowId);
            else if (resData.data && resData.data.rowId) createdRows.push(resData.data.rowId);
        }

        console.log(`Creating Group C booking (should succeed under new logic)...`);
        const createRes = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: false,
                name: `Group C (Test Target)`,
                phone: "123456",
                guestCount: 1,
                service_code: "60",
                duration: 60,
                location: "本館",
                date: dateStr,
                startTime: "11:00",
                type: "SINGLE",
                guests: [{ category: "SINGLE", flow: "M", duration: 60 }],
                flow: "M",
                status: "NEW"
            }
        });
        
        const testText = await createRes.text();
        console.log("Group C Result:", testText);
        expect(createRes.ok()).toBeTruthy();
        
        const resData = JSON.parse(testText);
        if (resData.rowId) createdRows.push(resData.rowId);
        else if (resData.data && resData.data.rowId) createdRows.push(resData.data.rowId);

        // Cleanup
        console.log("Cleaning up test data...");
        for (const rowId of createdRows) {
            await request.post('http://localhost:5001/api/update-status', {
                data: { rowId: rowId, status: "CANCEL" }
            });
        }
    });
});
