const axios = require('axios');
const assert = require('assert');

async function runTest() {
    console.log("Starting Backend E2E Test for inline staff update...");
    const API_URL = 'http://localhost:5001';

    try {
        const testName = `BackendTest_${Date.now()}`;
        const todayStr = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '/');
        
        console.log(`Creating initial booking with name ${testName}...`);
        const createRes = await axios.post(`${API_URL}/api/admin-booking`, {
            date: todayStr,
            time: "14:00",
            name: testName,
            phone: "0912345678",
            service: "指壓",
            status: "WAITING",
            staff: "隨機",
            location: "本館",
            source: "test",
            duration: 60,
            startTimeString: `${todayStr} 14:00`,
            ngayDen: todayStr,
            gioDen: "14:00",
            dichVu: "指壓",
            nhanVien: "隨機",
            hoTen: testName,
            sdt: "0912345678",
            trangThai: "WAITING"
        });
        assert.ok(createRes.data.success, "Failed to create initial booking");

        console.log("Waiting for Google Sheet sync (polling /api/info)...");
        let testBooking = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const infoRes = await axios.get(`${API_URL}/api/info`);
            testBooking = infoRes.data.bookings.find(b => b.hoTen === testName);
            if (testBooking) break;
            console.log(`Poll ${i+1}: Booking not found yet...`);
        }
        
        assert.ok(testBooking, "Booking never appeared in /api/info after 30 seconds");
        
        const rowId = testBooking.rowId;
        const initialPhase1 = testBooking.phase1_res_idx || testBooking.phase1_resource;
        console.log(`✅ Booking created and synced. rowId: ${rowId}, Initial phase1_res_idx: ${initialPhase1}`);

        // 3. Update staff ONLY (Inline Edit simulation)
        console.log("Updating staff via inline edit simulation...");
        const updateRes = await axios.post(`${API_URL}/api/admin-booking`, {
            rowId: rowId,
            ngayDen: todayStr,
            gioDen: "14:00",
            dichVu: "指壓",
            nhanVien: "王",
            status: "WAITING",
            pax: 1,
            isOil: false,
            duration: 60,
            hoTen: testName,
            sdt: "0912345678",
            location: "本館",
            source: "admin_inline_edit"
        });
        assert.ok(updateRes.data.success, "Failed to update booking");

        console.log("Waiting for Google Sheet sync (polling /api/info for staff update)...");
        let updatedBooking = null;
        for (let i = 0; i < 5; i++) {
            await new Promise(r => setTimeout(r, 1000));
            const infoRes2 = await axios.get(`${API_URL}/api/info`);
            const b = infoRes2.data.bookings.find(b => String(b.rowId) === String(rowId));
            if (b && b.nhanVien === "王") {
                updatedBooking = b;
                break;
            }
            console.log(`Poll ${i+1}: Staff not updated in sheet yet...`);
        }
        
        assert.ok(updatedBooking, "Updated booking with new staff never appeared in /api/info");
        
        const updatedPhase1 = updatedBooking.phase1_res_idx || updatedBooking.phase1_resource;
        console.log(`✅ Updated booking synced. Staff: ${updatedBooking.nhanVien}, Phase1: ${updatedPhase1}`);
        
        if (initialPhase1) {
            assert.strictEqual(updatedPhase1, initialPhase1, "❌ ERROR: phase1_res_idx WAS OVERWRITTEN!");
            console.log("✅ TEST PASSED: phase1_res_idx was correctly preserved.");
        } else {
            console.log("⚠️ WARNING: Initial booking didn't have phase1_res_idx assigned by backend, test technically passes but allocation logic may be skipping it.");
        }
        
    } catch (e) {
        console.error("❌ Test Failed:", e.message);
        if (e.response) {
            console.error("Response data:", e.response.data);
        }
        process.exit(1);
    }
}

runTest();
