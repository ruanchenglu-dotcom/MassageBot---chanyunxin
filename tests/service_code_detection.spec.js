const { test, expect } = require('@playwright/test');

test.describe('Service Code Detection Logic', () => {
  test('Should strictly detect resource type and combo based on serviceCode', async ({ page }) => {
    await page.goto('http://localhost:5001', { waitUntil: 'networkidle' });

    const results = await page.evaluate(() => {
      return {
        typeA4: detectResourceType('A4'),
        typeB2: detectResourceType('B2'),
        typeF3: detectResourceType('F3'),
        typeC1: detectResourceType('C1'),
        typeMissing: detectResourceType(null),

        isComboA4: isComboService('A4'),
        isComboB2: isComboService('B2'),
        isComboF3: isComboService('F3'),
        isComboMissing: isComboService(null),
        
        flowA4: inferFlowFromService ? inferFlowFromService('A4') : null,
        flowB2: inferFlowFromService ? inferFlowFromService('B2') : null,
        flowF3: inferFlowFromService ? inferFlowFromService('F3') : null
      };
    });

    expect(results.typeA4).toBe('BED');
    expect(results.typeB2).toBe('BED');
    expect(results.typeF3).toBe('CHAIR');
    expect(results.typeC1).toBe('BED');
    expect(results.typeMissing).toBe('CHAIR');

    expect(results.isComboA4).toBe(true);
    expect(results.isComboB2).toBe(false);
    expect(results.isComboF3).toBe(false);
    expect(results.isComboMissing).toBe(false);

    expect(results.flowA4).toBe('FB');
    expect(results.flowB2).toBe('BODYSINGLE');
    expect(results.flowF3).toBe('FOOTSINGLE');
  });
});


