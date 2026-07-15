const { test, expect } = require('@playwright/test');

test.describe('Bug Fix - Resource Conflict on Transition Time Shrink', () => {
    test('Should allow transition_time to shrink Phase 1 without throwing RESOURCE_CONFLICT', async ({ request }) => {
        // 1. Tạo một booking Combo FB (Chân 55, Thân 45)
        const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
        const createRes = await request.post('http://localhost:5001/api/admin-booking', {
            data: {
                is_group_booking: false,
                name: "Test Overlap Shrink",
                phone: "123456",
                guestCount: 1,
                service_code: "100",
                duration: 100,
                location: "本館",
                date: dateStr,
                startTime: "10:00",
                type: "COMBO",
                guests: [{ category: "COMBO", flow: "FB" }],
                flow: "FB",
                phase1_res_idx: "CHAIR-1-5",
                phase2_res_idx: "BED-1-3",
                phase1_duration: 55,
                phase2_duration: 45,
                status: "NEW"
            }
        });
        const text = await createRes.text();
        console.log("Create Response:", text);
        expect(createRes.ok()).toBeTruthy();
        const createData = JSON.parse(text);
        let rowId = createData.rowId;
        if (!rowId && createData.data && createData.data.rowId) rowId = createData.data.rowId;
        console.log("Row ID:", rowId);

        // 2. Cập nhật booking: Thay đổi transition_time lên 10:52 (sớm hơn so với 10:55)
        // Đây chính là điểm lỗi cũ: backend không shrink p1_duration nên báo Overlap
        const updateRes = await request.post('http://localhost:5001/api/batch-process-bookings', {
            data: {
                payloads: [
                    {
                        rowId: rowId,
                        forceSync: true,
                        phase1_res_idx: "CHAIR-1-5",
                        phase2_res_idx: "BED-1-3",
                        transition_time: `${dateStr} 10:52`
                    }
                ]
            }
        });

        // 3. Đảm bảo cập nhật thành công, không gặp lỗi RESOURCE_CONFLICT
        const updateText = await updateRes.text();
        console.log("Update Response:", updateText);
        expect(updateRes.ok()).toBeTruthy();
        const updateData = JSON.parse(updateText);
        expect(updateData.success).toBe(true);

        // 4. Xóa dữ liệu test (Clean up)
        await request.post('http://localhost:5001/api/update-status', {
            data: { rowId: rowId, status: "CANCEL" }
        });
    });
});
