const { test, expect } = require('@playwright/test');

test.describe('DFS Capacity Matching E2E', () => {
    test('Should reject if YouTui is blocked by generic FEMALE booking', async ({ page }) => {
        // Open App
        page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
        page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));
        
        await page.goto('http://localhost:5001/admin2/index.html', { waitUntil: 'networkidle' });
        
        await page.waitForTimeout(1000); // Wait for scripts to load
        
        const result = await page.evaluate(() => {
            const queryDateStr = "2026-10-10";

            // 3 Staff: 1 Male (No YouTui), 2 Female (With YouTui)
            const staffList = {
                "Male1": { name: "Male1", gender: "M", isYouTui: false, "2026-10-10": "09:00-21:00" },
                "Female1": { name: "Female1", gender: "F", isYouTui: true, "2026-10-10": "09:00-21:00" },
                "Female2": { name: "Female2", gender: "F", isYouTui: true, "2026-10-10": "09:00-21:00" }
            };

            // Existing Booking: 1 Guest, requesting FEMALE (No YouTui)
            const currentBookingsRaw = [
                {
                    startTime: "10:00",
                    duration: 60,
                    staffName: "FEMALE",
                    assignedStaffs: ["FEMALE"],
                    serviceName: "Foot Massage",
                    status: "CONFIRMED"
                }
            ];

            // New Request: 2 Guests, both need YouTui
            const guestList = [
                { staff: "Any", serviceName: "Oil Massage", isYouTui: true, overrideDuration: 60 },
                { staff: "Any", serviceName: "Oil Massage", isYouTui: true, overrideDuration: 60 }
            ];

            const requestStart = 10 * 60; // 10:00 AM
            const maxDuration = 60;

            if (typeof window.validateGlobalCapacity !== 'function') {
                return new Promise(resolve => {
                    let attempts = 0;
                    let iv = setInterval(() => {
                        attempts++;
                        if (typeof window.validateGlobalCapacity === 'function') {
                            clearInterval(iv);
                            resolve(window.validateGlobalCapacity(requestStart, maxDuration, guestList, currentBookingsRaw, staffList, queryDateStr, true));
                        } else if (attempts > 50) {
                            clearInterval(iv);
                            resolve({ pass: false, reason: 'validateGlobalCapacity not found after 5s' });
                        }
                    }, 100);
                });
            }

            return window.validateGlobalCapacity(
                requestStart, 
                maxDuration, 
                guestList, 
                currentBookingsRaw, 
                staffList, 
                queryDateStr, 
                true // isSimulation
            );
        });

        console.log("Validation Result:", result);
        
        expect(result.pass).toBe(false);
        expect(result.reason).toContain('⚠️');
    });
});

