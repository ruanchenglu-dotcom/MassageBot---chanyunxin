const axios = require('axios');

async function testGroupFootSave() {
    try {
        console.log("1. Creating a group combo booking for testing...");
        const payloadCreate = {
            hoTen: "Test Group Combo",
            sdt: "0900000000",
            dichVu: "早鳥 / 晚鳥 套餐 (110分)",
            serviceCode: "A3",
            ngayDen: new Date().toISOString().split('T')[0].replace(/-/g, '/'),
            gioDen: "14:00",
            guestDetails: [
                { service: "早鳥 / 晚鳥 套餐 (110分)", serviceCode: "A3", staff: "隨機" },
                { service: "早鳥 / 晚鳥 套餐 (110分)", serviceCode: "A3", staff: "隨機" },
                { service: "早鳥 / 晚鳥 套餐 (110分)", serviceCode: "A3", staff: "隨機" },
                { service: "早鳥 / 晚鳥 套餐 (110分)", serviceCode: "A3", staff: "隨機" }
            ],
            location: "本館"
        };
        const resCreate = await axios.post('http://localhost:5001/api/admin-booking', payloadCreate);
        if (!resCreate.data.success) {
            console.error("Failed to create booking:", resCreate.data);
            return;
        }
        
        console.log("Booking created successfully.");

        // Fetch cache to find the rowIds
        const resCache = await axios.get('http://localhost:5001/api/info');
        let groupIds = [];
        if (resCache.data && resCache.data.bookings) {
            groupIds = resCache.data.bookings.filter(x => x.customerName.includes("Test Group Combo")).map(x => x.rowId);
        }
        if (groupIds.length < 4) {
            console.error("Could not find all 4 bookings in cache.", groupIds);
            return;
        }
        console.log("Found Row IDs:", groupIds);

        // 2. Simulate UPDATE_SERVICE for group
        console.log("2. Simulating inline-update-group (Saving Single Foot)...");
        
        const allUpdates = [];
        for (let i = 0; i < groupIds.length; i++) {
            const data = {
                ngayDen: payloadCreate.ngayDen,
                gioDen: "14:00",
                hoTen: "Test Group Combo",
                dichVu: "腳底按摩 (90分)",
                serviceCode: "F2",
                isYouTui: false,
                isGuaSha: false,
                sdt: "0900000000",
                trangThai: "已預約",
                nhanVien: "隨機",
                phase2_duration: "",
                phase2_res_idx: "",
                flow: "",
                transition_time: ""
            };
            allUpdates.push({ rowId: String(groupIds[i]), updatedData: data });
        }

        const payloadUpdate = {
            groupUpdates: allUpdates
        };

        const resUpdate = await axios.post('http://localhost:5001/api/inline-update-group', payloadUpdate);
        console.log("Update response:", resUpdate.data);
        
        if (resUpdate.data.success) {
            console.log("✅ testGroupFootSave passed!");
        } else {
            console.error("❌ testGroupFootSave failed!");
        }
        
    } catch (e) {
        console.error("❌ Test crashed:", e.response ? e.response.data : e.message);
    }
}

testGroupFootSave();
