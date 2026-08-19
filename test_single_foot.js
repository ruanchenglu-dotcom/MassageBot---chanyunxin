const axios = require('axios');

async function testSingleFootSave() {
    try {
        console.log("1. Creating a combo booking for testing...");
        const payloadCreate = {
            hoTen: "Test Combo to Foot",
            sdt: "0900000000",
            dichVu: "早鳥 / 晚鳥 套餐 (110分)", // Example combo
            serviceCode: "A3",
            ngayDen: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
            gioDen: "14:00",
            guestDetails: [
                { service: "早鳥 / 晚鳥 套餐 (110分)", serviceCode: "A3", isYouTui: false, isGuaSha: false, staff: "隨機" }
            ],
            location: "本館"
        };
        const resCreate = await axios.post('http://localhost:5001/api/admin-booking', payloadCreate);
        if (!resCreate.data.success) {
            console.error("Failed to create booking:", resCreate.data);
            return;
        }
        
        console.log("Booking created successfully.");

        // Fetch cache to find the rowId
        const resCache = await axios.get('http://localhost:5001/api/info');
        let targetRowId = null;
        if (resCache.data && resCache.data.bookings) {
            const b = resCache.data.bookings.find(x => x.customerName.includes("Test Combo to Foot"));
            if (b) targetRowId = b.rowId;
        }
        if (!targetRowId) {
            console.error("Could not find the created booking in cache.");
            return;
        }
        console.log("Found Row ID:", targetRowId);

        // 2. Simulate UPDATE_SINGLE_TIME_LOC payload
        console.log("2. Simulating UPDATE_SINGLE_TIME_LOC (Saving Single Foot)...");
        const payloadUpdate = {
            rowId: String(targetRowId),
            is_locked: "TRUE",
            isManualLocked: true,
            forceSync: true,
            serviceCode: "F2", // Example foot code
            dichVu: "腳底按摩 (60分)",
            updateCheckinOnly: false,
            flow: "FOOTSINGLE",
            phase2_duration: "",
            phase2_res_idx: ""
        };

        const resUpdate = await axios.post('http://localhost:5001/api/update-booking-details', payloadUpdate);
        console.log("Update response:", resUpdate.data);
        
        if (resUpdate.data.success) {
            console.log("✅ testSingleFootSave passed! The API accepts the new service parameters without crashing.");
        } else {
            console.error("❌ testSingleFootSave failed!");
        }
        
    } catch (e) {
        console.error("❌ Test crashed:", e.response ? e.response.data : e.message);
    }
}

testSingleFootSave();
