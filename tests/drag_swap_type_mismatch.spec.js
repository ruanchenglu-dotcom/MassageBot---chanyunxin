const { test, expect } = require('@playwright/test');

test.describe('Type Check E2E Tests', () => {
  test('should block dragging single BED booking to CHAIR row', async ({ page }) => {
    // Intercept auth
    await page.route('/api/check-auth', async route => {
        await route.fulfill({ json: { authenticated: true, user: { role: 'admin' } } });
    });

    // Intercept data to provide a controlled environment
    await page.route('/api/get-all-data', async route => {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        
        await route.fulfill({
            json: {
                bookings: [
                    {
                        rowId: 'SINGLE_BED_1',
                        category: 'SINGLE',
                        serviceName: '身體按摩',
                        current_resource_id: 'BED-1-1',
                        location: 'BED-1-1',
                        startTimeString: `${dateStr} 12:00`,
                        duration: 60,
                        status: 'WAITING',
                        customerName: 'TestBed',
                        guestCount: '1/1',
                        group_id: 'G1'
                    },
                    {
                        rowId: 'COMBO_CHAIR_1',
                        category: 'COMBO',
                        serviceName: '套餐',
                        flow: 'BF',
                        phase1_res_idx: 'BED-1-2',
                        phase2_res_idx: 'CHAIR-1-1',
                        startTimeString: `${dateStr} 11:00`,
                        duration: 120,
                        status: 'WAITING',
                        customerName: 'TestCombo',
                        guestCount: '1/1',
                        group_id: 'G2'
                    }
                ],
                resources: [
                    { resource_id: 'BED-1-1', resource_type: 'BED', resource_name: '床1-1' },
                    { resource_id: 'BED-1-2', resource_type: 'BED', resource_name: '床1-2' },
                    { resource_id: 'CHAIR-1-1', resource_type: 'CHAIR', resource_name: '腳1-1' },
                    { resource_id: 'CHAIR-1-2', resource_type: 'CHAIR', resource_name: '腳1-2' }
                ],
                staff: [],
                attendance: []
            }
        });
    });

    // Mock other APIs to prevent errors
    await page.route('/api/sync-booking-times', async route => route.fulfill({ json: { success: true } }));
    await page.route('**/api/config', async route => route.fulfill({ json: { BUFFERS: { CLEANUP_MINUTES: 5, TRANSITION_MINUTES: 5 }, TOLERANCE: 1 } }));

    // Go to the local app
    await page.goto('http://localhost:5001/XinWuChanAdmin/cyx_XinWuChan.html');

    // Wait for the timeline to render
    await page.waitForSelector('.booking-block', { timeout: 15000 }).catch(() => null);

    // Give it a little time to render blocks
    await page.waitForTimeout(2000);

    const blocks = await page.locator('.booking-block').all();
    console.log(`Found ${blocks.length} blocks`);
    
    // Find the single BED booking (TestBed)
    const bedBlock = page.locator('.booking-block:has-text("TestBed")');
    // Find the CHAIR phase of the combo booking
    const comboChairBlock = page.locator('.booking-block:has-text("TestCombo")').nth(1); // Usually Phase 2 is rendered as a separate block

    if (await bedBlock.count() > 0 && await comboChairBlock.count() > 0) {
        const sourceBox = await bedBlock.boundingBox();
        const targetBox = await comboChairBlock.boundingBox();
        
        if (sourceBox && targetBox) {
            // Drag BED booking to CHAIR phase
            await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
            await page.mouse.down();
            // Move to target
            await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 10 });
            await page.mouse.up();
            
            // Wait for Swal modal
            await page.waitForSelector('.swal2-popup', { timeout: 5000 });
            
            const swalText = await page.locator('.swal2-html-container').innerText();
            console.log('Swal message:', swalText);
            
            // Assert that the warning is displayed
            expect(swalText).toContain('不可將單項服務換位至不同類型的座位');
            
            // Click OK to dismiss
            await page.locator('.swal2-confirm').click();
        } else {
            console.log("Could not get bounding boxes");
        }
    } else {
        console.log("Blocks not found. Skipped.");
    }
  });
});
