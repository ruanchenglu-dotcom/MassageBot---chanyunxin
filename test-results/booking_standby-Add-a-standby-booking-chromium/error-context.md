# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: booking_standby.spec.js >> Add a standby booking
- Location: tests\booking_standby.spec.js:3:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/輸入號碼/)

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: V109.8
      - generic [ref=e7]: 心悟禪養身館 (中和店)
      - generic [ref=e8]:
        - button "❯" [ref=e9] [cursor=pointer]
        - textbox [ref=e10] [cursor=pointer]: 2026-07-15
        - button "❯" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - button " 本館" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
        - generic [ref=e15]: 本館
      - button " 對面館" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 
        - generic [ref=e18]: 對面館
      - button " 列表 (List)" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 
        - generic [ref=e21]: 列表 (List)
    - generic [ref=e22]:
      - button " 立即刷新" [ref=e23] [cursor=pointer]:
        - generic [ref=e24]: 
        - generic [ref=e25]: 立即刷新
      - button " 預約" [ref=e26] [cursor=pointer]:
        - generic [ref=e27]: 
        - generic [ref=e28]: 預約
      - button " 技師報到" [ref=e29] [cursor=pointer]:
        - generic [ref=e30]: 
        - generic [ref=e31]: 技師報到
  - main [ref=e33]:
    - generic [ref=e37]:
      - generic:
        - generic:
          - generic: 00:00 現在
      - generic "雙擊回到現在" [ref=e38] [cursor=pointer]:
        - generic [ref=e39]: 區域
        - generic [ref=e40]:
          - generic [ref=e41]:
            - generic [ref=e42]: 8:00
            - button "" [ref=e43]:
              - generic [ref=e44]: 
          - generic [ref=e45]:
            - generic [ref=e46]: 9:00
            - button "" [ref=e47]:
              - generic [ref=e48]: 
          - generic [ref=e49]:
            - generic [ref=e50]: 10:00
            - button "" [ref=e51]:
              - generic [ref=e52]: 
          - generic [ref=e53]:
            - generic [ref=e54]: 11:00
            - button "" [ref=e55]:
              - generic [ref=e56]: 
          - generic [ref=e57]:
            - generic [ref=e58]: 12:00
            - button "" [ref=e59]:
              - generic [ref=e60]: 
          - generic [ref=e61]:
            - generic [ref=e62]: 13:00
            - button "" [ref=e63]:
              - generic [ref=e64]: 
          - generic [ref=e65]:
            - generic [ref=e66]: 14:00
            - button "" [ref=e67]:
              - generic [ref=e68]: 
          - generic [ref=e69]:
            - generic [ref=e70]: 15:00
            - button "" [ref=e71]:
              - generic [ref=e72]: 
          - generic [ref=e73]:
            - generic [ref=e74]: 16:00
            - button "" [ref=e75]:
              - generic [ref=e76]: 
          - generic [ref=e77]:
            - generic [ref=e78]: 17:00
            - button "" [ref=e79]:
              - generic [ref=e80]: 
          - generic [ref=e81]:
            - generic [ref=e82]: 18:00
            - button "" [ref=e83]:
              - generic [ref=e84]: 
          - generic [ref=e85]:
            - generic [ref=e86]: 19:00
            - button "" [ref=e87]:
              - generic [ref=e88]: 
          - generic [ref=e89]:
            - generic [ref=e90]: 20:00
            - button "" [ref=e91]:
              - generic [ref=e92]: 
          - generic [ref=e93]:
            - generic [ref=e94]: 21:00
            - button "" [ref=e95]:
              - generic [ref=e96]: 
          - generic [ref=e97]:
            - generic [ref=e98]: 22:00
            - button "" [ref=e99]:
              - generic [ref=e100]: 
          - generic [ref=e101]:
            - generic [ref=e102]: 23:00
            - button "" [ref=e103]:
              - generic [ref=e104]: 
          - generic [ref=e105]:
            - generic [ref=e106]: 0:00
            - button "" [ref=e107]:
              - generic [ref=e108]: 
          - generic [ref=e109]:
            - generic [ref=e110]: 1:00
            - button "" [ref=e111]:
              - generic [ref=e112]: 
          - generic [ref=e113]:
            - generic [ref=e114]: 2:00
            - button "" [ref=e115]:
              - generic [ref=e116]: 
          - generic [ref=e117]:
            - generic [ref=e118]: 3:00
            - button "" [ref=e119]:
              - generic [ref=e120]: 
          - generic [ref=e121]:
            - generic [ref=e122]: 4:00
            - button "" [ref=e123]:
              - generic [ref=e124]: 
      - generic [ref=e125]:
        - generic [ref=e126]:
          - generic "拖曳此處以互換整排客人" [ref=e127]: 腳1-1
          - generic [ref=e128]:
            - generic "腳底按摩 (120分) ⏳ 同步中..." [ref=e129] [cursor=pointer]:
              - generic [ref=e131]: 方(2/2)(345)
              - generic [ref=e132]:
                - generic [ref=e133]: 隨機
                - generic [ref=e134]: 12:01
              - button "" [ref=e135]:
                - generic [ref=e136]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e137] [cursor=pointer]:
              - generic [ref=e138]:
                - generic [ref=e139]: 康(1/3)(569)
                - generic "先身後足" [ref=e140]: BF
              - generic [ref=e141]:
                - generic [ref=e142]: 隨機
                - generic [ref=e143]: 14:42
        - generic [ref=e144]:
          - generic "拖曳此處以互換整排客人" [ref=e145]: 腳1-2
          - generic [ref=e146]:
            - generic "腳底按摩 (120分) ⏳ 同步中..." [ref=e147] [cursor=pointer]:
              - generic [ref=e149]: 方(1/2)(345)
              - generic [ref=e150]:
                - generic [ref=e151]: 隨機
                - generic [ref=e152]: 12:01
              - button "" [ref=e153]:
                - generic [ref=e154]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e155] [cursor=pointer]:
              - generic [ref=e156]:
                - generic [ref=e157]: 康(2/3)(569)
                - generic "先身後足" [ref=e158]: BF
              - generic [ref=e159]:
                - generic [ref=e160]: 隨機
                - generic [ref=e161]: 14:42
        - generic [ref=e162]:
          - generic "拖曳此處以互換整排客人" [ref=e163]: 腳1-3
          - generic [ref=e164]:
            - generic "腳底按摩 (90分) ⏳ 同步中..." [ref=e165] [cursor=pointer]:
              - generic [ref=e167]: 易(2/2)(456)
              - generic [ref=e168]:
                - generic [ref=e169]: 隨機
                - generic [ref=e170]: 12:46
              - button "" [ref=e171]:
                - generic [ref=e172]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e173] [cursor=pointer]:
              - generic [ref=e174]:
                - generic [ref=e175]: 杜(1/1)(545)
                - generic "先足後身" [ref=e176]: FB
              - generic [ref=e177]:
                - generic [ref=e178]: 隨機
                - generic [ref=e179]: 10:40
              - button "" [ref=e180]:
                - generic [ref=e181]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e182] [cursor=pointer]:
              - generic [ref=e183]:
                - generic [ref=e184]: 康(3/3)(569)
                - generic "先足後身" [ref=e185]: FB
              - generic [ref=e186]:
                - generic [ref=e187]: 隨機
                - generic [ref=e188]: 13:50
              - button "" [ref=e189]:
                - generic [ref=e190]: 
        - generic [ref=e191]:
          - generic "拖曳此處以互換整排客人" [ref=e192]: 腳1-4
          - generic [ref=e193]:
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e194] [cursor=pointer]':
              - generic [ref=e195]:
                - generic [ref=e196]: 張(2/4)(563)
                - generic "先足後身" [ref=e197]: FB
              - generic [ref=e198]:
                - generic [ref=e199]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e200]': 📝
                - generic [ref=e201]: 10:20
              - button "" [ref=e202]:
                - generic [ref=e203]: 
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e204] [cursor=pointer]':
              - generic [ref=e205]:
                - generic [ref=e206]: 張(4/4)(563)
                - generic "先身後足" [ref=e207]: BF
              - generic [ref=e208]:
                - generic [ref=e209]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e210]': 📝
                - generic [ref=e211]: 11:12
        - generic [ref=e212]:
          - generic "拖曳此處以互換整排客人" [ref=e213]: 腳1-5
          - generic [ref=e214]:
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e215] [cursor=pointer]':
              - generic [ref=e216]:
                - generic [ref=e217]: 張(1/4)(563)
                - generic "先身後足" [ref=e218]: BF
              - generic [ref=e219]:
                - generic [ref=e220]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e221]': 📝
                - generic [ref=e222]: 11:12
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e223] [cursor=pointer]':
              - generic [ref=e224]:
                - generic [ref=e225]: 張(3/4)(563)
                - generic "先足後身" [ref=e226]: FB
              - generic [ref=e227]:
                - generic [ref=e228]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e229]': 📝
                - generic [ref=e230]: 10:20
              - button "" [ref=e231]:
                - generic [ref=e232]: 
        - generic [ref=e233]:
          - generic "拖曳此處以互換整排客人" [ref=e234]: 腳1-6
          - generic "套餐 (100分) ⏳ 同步中..." [ref=e236] [cursor=pointer]:
            - generic [ref=e237]:
              - generic [ref=e238]: 易(1/1)(635)
              - generic "先足後身" [ref=e239]: FB
            - generic [ref=e240]:
              - generic [ref=e241]: 隨機
              - generic [ref=e242]: 11:10
            - button "" [ref=e243]:
              - generic [ref=e244]: 
        - generic [ref=e245]:
          - generic "拖曳此處以互換整排客人" [ref=e246]: 床1-1
          - generic [ref=e247]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e248] [cursor=pointer]:
              - generic [ref=e249]:
                - generic [ref=e250]: 杜(1/1)(545)
                - generic "先足後身" [ref=e251]: FB
              - generic [ref=e252]:
                - generic [ref=e253]: 隨機
                - generic [ref=e254]: 11:42
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e255] [cursor=pointer]:
              - generic [ref=e256]:
                - generic [ref=e257]: 康(1/3)(569)
                - generic "先身後足" [ref=e258]: BF
              - generic [ref=e259]:
                - generic [ref=e260]: 隨機
                - generic [ref=e261]: 13:45
              - button "" [ref=e262]:
                - generic [ref=e263]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e264] [cursor=pointer]:
              - generic [ref=e265]:
                - generic [ref=e266]: 康(3/3)(569)
                - generic "先足後身" [ref=e267]: FB
              - generic [ref=e268]:
                - generic [ref=e269]: 隨機
                - generic [ref=e270]: 14:42
        - generic [ref=e271]:
          - generic "拖曳此處以互換整排客人" [ref=e272]: 床1-2
          - generic [ref=e273]:
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e274] [cursor=pointer]':
              - generic [ref=e275]:
                - generic [ref=e276]: 張(1/4)(563)
                - generic "先身後足" [ref=e277]: BF
              - generic [ref=e278]:
                - generic [ref=e279]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e280]': 📝
                - generic [ref=e281]: 10:20
              - button "" [ref=e282]:
                - generic [ref=e283]: 
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e284] [cursor=pointer]':
              - generic [ref=e285]:
                - generic [ref=e286]: 張(2/4)(563)
                - generic "先足後身" [ref=e287]: FB
              - generic [ref=e288]:
                - generic [ref=e289]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e290]': 📝
                - generic [ref=e291]: 11:12
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e292] [cursor=pointer]:
              - generic [ref=e293]:
                - generic [ref=e294]: 康(2/3)(569)
                - generic "先身後足" [ref=e295]: BF
              - generic [ref=e296]:
                - generic [ref=e297]: 隨機
                - generic [ref=e298]: 13:50
              - button "" [ref=e299]:
                - generic [ref=e300]: 
        - generic [ref=e301]:
          - generic "拖曳此處以互換整排客人" [ref=e302]: 床1-3
          - generic [ref=e303]:
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e304] [cursor=pointer]':
              - generic [ref=e305]:
                - generic [ref=e306]: 張(3/4)(563)
                - generic "先足後身" [ref=e307]: FB
              - generic [ref=e308]:
                - generic [ref=e309]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e310]': 📝
                - generic [ref=e311]: 11:12
            - 'generic "套餐 (100分) ⏳ 同步中... 📝 備註: 腳久一點" [ref=e312] [cursor=pointer]':
              - generic [ref=e313]:
                - generic [ref=e314]: 張(4/4)(563)
                - generic "先身後足" [ref=e315]: BF
              - generic [ref=e316]:
                - generic [ref=e317]:
                  - text: 隨機
                  - 'generic "備註: 腳久一點" [ref=e318]': 📝
                - generic [ref=e319]: 10:20
              - button "" [ref=e320]:
                - generic [ref=e321]: 
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e322] [cursor=pointer]:
              - generic [ref=e323]:
                - generic [ref=e324]: 易(1/1)(635)
                - generic "先足後身" [ref=e325]: FB
              - generic [ref=e326]:
                - generic [ref=e327]: 隨機
                - generic [ref=e328]: 12:02
        - generic "拖曳此處以互換整排客人" [ref=e330]: 床1-4
        - generic [ref=e332]:
          - generic "拖曳此處以互換整排客人" [ref=e333]: 床1-5
          - generic "身體按摩 (90分) ⏳ 同步中..." [ref=e335] [cursor=pointer]:
            - generic [ref=e337]: 黃(2/2)(356)
            - generic [ref=e338]:
              - generic [ref=e339]: 隨機
              - generic [ref=e340]: 11:11
            - button "" [ref=e341]:
              - generic [ref=e342]: 
        - generic [ref=e343]:
          - generic "拖曳此處以互換整排客人" [ref=e344]: 床1-6
          - generic "身體按摩 (90分) ⏳ 同步中..." [ref=e346] [cursor=pointer]:
            - generic [ref=e348]: 黃(1/2)(356)
            - generic [ref=e349]:
              - generic [ref=e350]: 隨機
              - generic [ref=e351]: 11:11
            - button "" [ref=e352]:
              - generic [ref=e353]: 
  - generic [ref=e355]:
    - generic [ref=e356]:
      - generic [ref=e357]:
        - heading "📅 預約" [level=3] [ref=e358]
        - generic [ref=e359]:
          - button "本館" [ref=e360] [cursor=pointer]
          - button "對面館" [ref=e361] [cursor=pointer]
          - button "跨館套餐" [ref=e362] [cursor=pointer]
      - generic [ref=e363]:
        - generic [ref=e364]:
          - button "⬅️ 返回" [ref=e365] [cursor=pointer]:
            - generic [ref=e366]: ⬅️
            - generic [ref=e367]: 返回
          - button "✅ 確認" [ref=e368] [cursor=pointer]
        - button "×" [ref=e369] [cursor=pointer]
    - generic [ref=e371]:
      - generic [ref=e372]:
        - generic [ref=e373]: 顧客姓名
        - generic [ref=e374]:
          - textbox "輸入姓名..." [active] [ref=e375]: Standby Test User
          - button "先生" [ref=e376] [cursor=pointer]
          - button "小姐" [ref=e377] [cursor=pointer]
          - button "姓" [ref=e378] [cursor=pointer]
      - generic [ref=e379]:
        - generic [ref=e380]: 電話號碼
        - textbox "09xx..." [ref=e381]: "09"
      - generic [ref=e382]:
        - generic [ref=e383]: 特別要求 / 備註
        - generic [ref=e384]:
          - textbox "輸入特別要求..." [ref=e385]
          - combobox [ref=e386] [cursor=pointer]:
            - option "⚡ 快速選擇" [selected]
            - option "先做身體"
            - option "先做腳底"
            - option "大力"
            - option "小力"
            - option "腳久一點"
            - option "身體久一點"
            - option "指定台灣老師"
            - option "指定越南老師"
      - generic [ref=e388]:
        - generic [ref=e389]: 2026-07-15
        - generic [ref=e390]: 12:00
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test('Add a standby booking', async ({ page }) => {
  4  |   // Navigate to the portal
  5  |   await page.goto('http://localhost:5001/admin2/index.html');
  6  | 
  7  |   // Wait for the UI to be fully loaded
  8  |   await expect(page.getByText('預約').first()).toBeVisible();
  9  | 
  10 |   // Step 1: Open the Reservation Modal
  11 |   await page.getByText('預約').first().click();
  12 | 
  13 |   const hourSelect = page.locator('select').first();
  14 |   await expect(hourSelect).toBeVisible();
  15 |   await hourSelect.selectOption('12');
  16 | 
  17 |   // Explicitly choose "套餐 (100分)"
  18 |   const guestRow = page.locator('div.flex.flex-col.gap-2').first();
  19 |   const guestServiceSelect = guestRow.locator('select').first();
  20 |   await guestServiceSelect.selectOption('套餐 (100分)');
  21 | 
  22 |   // Click Standby Button
  23 |   const standbyBtn = page.getByRole('button', { name: /📝 候補/ });
  24 |   await expect(standbyBtn).toBeVisible();
  25 |   await standbyBtn.click();
  26 | 
  27 |   // Step 2: Form step INFO -> Fill details
  28 |   const nameInput = page.getByPlaceholder(/輸入姓名/);
  29 |   await nameInput.fill('Standby Test User');
  30 | 
  31 |   const phoneInput = page.getByPlaceholder(/輸入號碼/);
> 32 |   await phoneInput.fill('0987654321');
     |                    ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  33 | 
  34 |   // Final Save
  35 |   const confirmBtn = page.getByRole('button', { name: /✅ 確認/ });
  36 |   await confirmBtn.click();
  37 | 
  38 |   // Verify modal closes
  39 |   await expect(page.getByRole('button', { name: /📝 候補/ })).toBeHidden({ timeout: 10000 });
  40 | });
  41 | 
```