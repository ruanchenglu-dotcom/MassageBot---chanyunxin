const { test, expect } = require('@playwright/test');
const fs = require('fs');

test.describe('Group COMBO to BODY Capacity Check', () => {
    test('Should calculate flowCode correctly for capacity check', async ({ page }) => {
        test.setTimeout(60000);
        
        // Read mock data
        const mockData = JSON.parse(fs.readFileSync('tests/mock_info.json', 'utf8'));

        // Mock API info
        await page.route('**/api/info*', route => {
            route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(mockData)
            });
        });

        // Mock updates
        await page.route('**/api/update-status', route => route.fulfill({ json: { status: 'success' } }));
        await page.route('**/api/inline-update-group', route => route.fulfill({ json: { status: 'success' } }));

        // 1. Open page to load the environment
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        await page.goto('http://localhost:5001/admin2/index.html');
        
        // Wait for UI to load
        await expect(page.getByText('預約')).toBeVisible();
        await page.waitForTimeout(2000); // Give it a bit to initialize globals
        
        // 2. Test the core availability logic with the missing serviceCode scenario
        const result = await page.evaluate(() => {
            // Mock a group of 4 changing to BODY 120 (B4)
            const dateStr = "2026/08/18";
            const timeStr = "12:00";
            
            // The guest details array constructed by cyx_views.js
            // Our fix was adding serviceCode: 'B4'
            const guestDetails = [
                { rowId: 1001, service: "身體按摩 (120分)", serviceName: "身體按摩 (120分)", serviceCode: "B4", staff: "隨機", overrideDuration: 120, flowCode: "SINGLE", location: "BED-1" },
                { rowId: 1002, service: "身體按摩 (120分)", serviceName: "身體按摩 (120分)", serviceCode: "B4", staff: "隨機", overrideDuration: 120, flowCode: "SINGLE", location: "BED-2" },
                { rowId: 1003, service: "身體按摩 (120分)", serviceName: "身體按摩 (120分)", serviceCode: "B4", staff: "隨機", overrideDuration: 120, flowCode: "SINGLE", location: "BED-3" },
                { rowId: 1004, service: "身體按摩 (120分)", serviceName: "身體按摩 (120分)", serviceCode: "B4", staff: "隨機", overrideDuration: 120, flowCode: "SINGLE", location: "BED-4" }
            ];
            
            // Mock existing bookings on timeline, EXCLUDING the 4 guests we are modifying (Virtual Clearance)
            const checkBookings = [
                // Some people occupying Chairs (which caused the fallback failure previously)
                { rowId: 2001, serviceName: "腳底按摩 (120分)", type: "CHAIR", startTime: "12:00", duration: 120 },
                { rowId: 2002, serviceName: "腳底按摩 (120分)", type: "CHAIR", startTime: "12:00", duration: 120 },
                { rowId: 2003, serviceName: "腳底按摩 (120分)", type: "CHAIR", startTime: "12:00", duration: 120 },
                { rowId: 2004, serviceName: "腳底按摩 (120分)", type: "CHAIR", startTime: "12:00", duration: 120 }
            ];
            
            const staffList = [];
            for (let i = 1; i <= 10; i++) {
                staffList.push({ id: 'Staff'+i, name: 'Staff'+i, gender: 'M', off: false, start: '08:00', end: '23:00', customShifts: {} });
            }
            
            // Call the core check
            return window.cyxCallCoreAvailabilityCheck(dateStr, timeStr, guestDetails, checkBookings, staffList);
        });

        console.log("Core Capacity Check Result:", result);
        
        // 3. Verify it passed. 
        // Previously this failed because it fell back to CHAIR and all chairs were taken.
        // With serviceCode: 'B4', it correctly checks BEDS and passes.
        expect(result.valid).toBe(true);
    });
});
