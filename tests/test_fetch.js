async function testBatch() {
    try {
        const res = await fetch('http://localhost:5001/api/info?forceRefresh=true');
        const json = await res.json();
        const b26 = json.bookings.find(b => b.rowId == '26');
        const b28 = json.bookings.find(b => b.rowId == '28');
        console.log('b26:', b26.customerName, b26.flow, b26.phase1_duration, b26.phase2_duration, b26.transition_time);
        console.log('b28:', b28.customerName, b28.flow, b28.phase1_duration, b28.phase2_duration, b28.transition_time);
    } catch (e) {
        console.error(e);
    }
}

testBatch();
