# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: group_combo_to_body_capacity.spec.js >> Group COMBO to BODY Capacity Check >> Should calculate flowCode correctly for capacity check
- Location: tests\group_combo_to_body_capacity.spec.js:4:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('.booking-block') to be visible

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
        - textbox [ref=e10] [cursor=pointer]: 2026-08-13
        - button "❯" [ref=e11] [cursor=pointer]
    - generic [ref=e12]:
      - button " 本館" [ref=e13] [cursor=pointer]:
        - generic [ref=e14]: 
        - generic [ref=e15]: 本館
      - button " 對面館" [ref=e16] [cursor=pointer]:
        - generic [ref=e17]: 
        - generic [ref=e18]: 對面館
      - button " 列表" [ref=e19] [cursor=pointer]:
        - generic [ref=e20]: 
        - generic [ref=e21]: 列表
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
  - generic [ref=e34]:
    - generic [ref=e36] [cursor=pointer]:
      - generic [ref=e37]: 于
      - generic [ref=e38]: 08:00
      - generic [ref=e39]: 
    - generic [ref=e43] [cursor=pointer]:
      - generic [ref=e44]: 傅
      - generic [ref=e45]: 08:00
      - generic [ref=e46]: 
    - generic [ref=e50] [cursor=pointer]:
      - generic [ref=e51]: 吳
      - generic [ref=e52]: 08:00
      - generic [ref=e53]: 
    - generic [ref=e57] [cursor=pointer]:
      - generic [ref=e58]: 寶
      - generic [ref=e59]: 08:00
      - generic [ref=e60]: 
    - generic [ref=e64] [cursor=pointer]:
      - generic [ref=e65]: 溫
      - generic [ref=e66]: 08:00
      - generic [ref=e67]: 
    - generic [ref=e71] [cursor=pointer]:
      - generic [ref=e72]: 王
      - generic [ref=e73]: 08:00
      - generic [ref=e74]: 
    - generic [ref=e78] [cursor=pointer]:
      - generic [ref=e79]: 賀
      - generic [ref=e80]: 08:00
      - generic [ref=e81]: 
    - generic [ref=e85] [cursor=pointer]:
      - generic [ref=e86]: 曹
      - generic [ref=e87]: 09:00
      - generic [ref=e88]: 
    - generic [ref=e92] [cursor=pointer]:
      - generic [ref=e93]: 歐
      - generic [ref=e94]: 09:00
      - generic [ref=e95]: 
    - generic [ref=e99] [cursor=pointer]:
      - generic [ref=e100]: 張
      - generic [ref=e101]: 10:00
      - generic [ref=e102]: 
    - generic [ref=e106] [cursor=pointer]:
      - generic [ref=e107]: 方
      - generic [ref=e108]: 10:00
      - generic [ref=e109]: 
    - generic [ref=e113] [cursor=pointer]:
      - generic [ref=e114]: 峻
      - generic [ref=e115]: 11:00
      - generic [ref=e116]: 
    - generic [ref=e120] [cursor=pointer]:
      - generic [ref=e121]: 易
      - generic [ref=e122]: 11:00
      - generic [ref=e123]: 
    - generic [ref=e127] [cursor=pointer]:
      - generic [ref=e128]: 金
      - generic [ref=e129]: 11:00
      - generic [ref=e130]: 
    - generic [ref=e134] [cursor=pointer]:
      - generic [ref=e135]: 丁
      - generic [ref=e136]: 12:00
      - generic [ref=e137]: 
    - generic [ref=e141] [cursor=pointer]:
      - generic [ref=e142]: 文
      - generic [ref=e143]: 12:00
      - generic [ref=e144]: 
    - generic [ref=e148] [cursor=pointer]:
      - generic [ref=e149]: 李
      - generic [ref=e150]: 12:00
      - generic [ref=e151]: 
    - generic [ref=e155] [cursor=pointer]:
      - generic [ref=e156]: 姜
      - generic [ref=e157]: 14:00
      - generic [ref=e158]: 
    - generic [ref=e162] [cursor=pointer]:
      - generic [ref=e163]: 安
      - generic [ref=e164]: 14:00
      - generic [ref=e165]: 
    - generic [ref=e169] [cursor=pointer]:
      - generic [ref=e170]: 林
      - generic [ref=e171]: 14:00
      - generic [ref=e172]: 
    - generic [ref=e176] [cursor=pointer]:
      - generic [ref=e177]: 芫
      - generic [ref=e178]: 14:00
      - generic [ref=e179]: 
    - generic [ref=e183] [cursor=pointer]:
      - generic [ref=e184]: 融
      - generic [ref=e185]: 14:00
      - generic [ref=e186]: 
    - generic [ref=e190] [cursor=pointer]:
      - generic [ref=e191]: 賈
      - generic [ref=e192]: 14:00
      - generic [ref=e193]: 
    - generic [ref=e197] [cursor=pointer]:
      - generic [ref=e198]: 陳
      - generic [ref=e199]: 14:00
      - generic [ref=e200]: 
    - generic [ref=e204] [cursor=pointer]:
      - generic [ref=e205]: 青
      - generic [ref=e206]: 14:00
      - generic [ref=e207]: 
    - generic [ref=e211] [cursor=pointer]:
      - generic [ref=e212]: 敏
      - generic [ref=e213]: 16:00
      - generic [ref=e214]: 
    - generic [ref=e218] [cursor=pointer]:
      - generic [ref=e219]: 派
      - generic [ref=e220]: 16:00
      - generic [ref=e221]: 
    - generic [ref=e225] [cursor=pointer]:
      - generic [ref=e226]: 滕
      - generic [ref=e227]: 16:00
      - generic [ref=e228]: 
    - generic [ref=e232] [cursor=pointer]:
      - generic [ref=e233]: 趙
      - generic [ref=e234]: 16:00
      - generic [ref=e235]: 
    - generic [ref=e239] [cursor=pointer]:
      - generic [ref=e240]: 阮
      - generic [ref=e241]: 16:00
      - generic [ref=e242]: 
    - generic [ref=e246] [cursor=pointer]:
      - generic [ref=e247]: 單
      - generic [ref=e248]: 19:00
      - generic [ref=e249]: 
    - generic [ref=e253] [cursor=pointer]:
      - generic [ref=e254]: 朱
      - generic [ref=e255]: 19:00
      - generic [ref=e256]: 
  - main [ref=e259]:
    - generic [ref=e263]:
      - generic: 15:36 現在
      - generic "雙擊回到現在" [ref=e264] [cursor=pointer]:
        - generic [ref=e265]: 區域
        - generic [ref=e266]:
          - generic [ref=e267]:
            - generic [ref=e268]: 8:00
            - button "" [ref=e269]
          - generic [ref=e271]:
            - generic [ref=e272]: 9:00
            - button "" [ref=e273]
          - generic [ref=e275]:
            - generic [ref=e276]: 10:00
            - button "" [ref=e277]
          - generic [ref=e279]:
            - generic [ref=e280]: 11:00
            - button "" [ref=e281]
          - generic [ref=e283]:
            - generic [ref=e284]: 12:00
            - button "" [ref=e285]
          - generic [ref=e287]:
            - generic [ref=e288]: 13:00
            - button "" [ref=e289]
          - generic [ref=e291]:
            - generic [ref=e292]: 14:00
            - button "" [ref=e293]
          - generic [ref=e295]:
            - generic [ref=e296]: 15:00
            - button "" [ref=e297]
          - generic [ref=e299]:
            - generic [ref=e300]: 16:00
            - button "" [ref=e301]
          - generic [ref=e303]:
            - generic [ref=e304]: 17:00
            - button "" [ref=e305]
          - generic [ref=e307]:
            - generic [ref=e308]: 18:00
            - button "" [ref=e309]
          - generic [ref=e311]:
            - generic [ref=e312]: 19:00
            - button "" [ref=e313]
          - generic [ref=e315]:
            - generic [ref=e316]: 20:00
            - button "" [ref=e317]
          - generic [ref=e319]:
            - generic [ref=e320]: 21:00
            - button "" [ref=e321]
          - generic [ref=e323]:
            - generic [ref=e324]: 22:00
            - button "" [ref=e325]
          - generic [ref=e327]:
            - generic [ref=e328]: 23:00
            - button "" [ref=e329]
          - generic [ref=e331]:
            - generic [ref=e332]: 0:00
            - button "" [ref=e333]
          - generic [ref=e335]:
            - generic [ref=e336]: 1:00
            - button "" [ref=e337]
          - generic [ref=e339]:
            - generic [ref=e340]: 2:00
            - button "" [ref=e341]
          - generic [ref=e343]:
            - generic [ref=e344]: 3:00
            - button "" [ref=e345]
          - generic [ref=e347]:
            - generic [ref=e348]: 4:00
            - button "" [ref=e349]
      - generic [ref=e351]:
        - generic [ref=e352]:
          - generic "拖曳此處以互換整排客人" [ref=e353]: 腳1-1
          - generic [ref=e354]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e355] [cursor=pointer]:
              - generic [ref=e356]:
                - generic [ref=e357]: 方(4/6)(345)
                - generic "先身後足" [ref=e358]: BF
              - generic [ref=e359]:
                - generic [ref=e360]: 隨機
                - generic [ref=e361]: 13:01
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e362] [cursor=pointer]:
              - generic [ref=e363]:
                - generic [ref=e364]: 楊(3/6)(345)
                - generic "先足後身" [ref=e365]: FB
              - generic [ref=e366]:
                - generic [ref=e367]: 隨機
                - generic [ref=e368]: 12:20
              - button "" [ref=e369]
            - generic "套餐 (190分)" [ref=e371] [cursor=pointer]:
              - generic [ref=e372]:
                - generic [ref=e373]: 高(2/4)(463)
                - generic "先足後身" [ref=e374]: FB
              - generic [ref=e375]:
                - generic [ref=e376]: 隨機
                - generic [ref=e377]: 16:05
              - button "" [ref=e378]
            - generic "套餐 (190分)" [ref=e380] [cursor=pointer]:
              - generic [ref=e381]:
                - generic [ref=e382]: 高(3/4)(463)
                - generic "先身後足" [ref=e383]: BF
              - generic [ref=e384]:
                - generic [ref=e385]: 隨機
                - generic [ref=e386]: 17:41
        - generic [ref=e387]:
          - generic "拖曳此處以互換整排客人" [ref=e388]: 腳1-2
          - generic [ref=e389]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e390] [cursor=pointer]:
              - generic [ref=e391]:
                - generic [ref=e392]: 方(5/6)(345)
                - generic "先身後足" [ref=e393]: BF
              - generic [ref=e394]:
                - generic [ref=e395]: 隨機
                - generic [ref=e396]: 13:00
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e397] [cursor=pointer]:
              - generic [ref=e398]:
                - generic [ref=e399]: 楊(4/6)(345)
                - generic "先足後身" [ref=e400]: FB
              - generic [ref=e401]:
                - generic [ref=e402]: 隨機
                - generic [ref=e403]: 12:20
              - button "" [ref=e404]
            - generic "套餐 (190分)" [ref=e406] [cursor=pointer]:
              - generic [ref=e407]:
                - generic [ref=e408]: 高(1/4)(463)
                - generic "先身後足" [ref=e409]: BF
              - generic [ref=e410]:
                - generic [ref=e411]: 隨機
                - generic [ref=e412]: 17:41
            - generic "套餐 (190分)" [ref=e413] [cursor=pointer]:
              - generic [ref=e414]:
                - generic [ref=e415]: 高(4/4)(463)
                - generic "先足後身" [ref=e416]: FB
              - generic [ref=e417]:
                - generic [ref=e418]: 隨機
                - generic [ref=e419]: 16:05
              - button "" [ref=e420]
        - generic [ref=e422]:
          - generic "拖曳此處以互換整排客人" [ref=e423]: 腳1-3
          - generic "套餐 (100分) ⏳ 同步中..." [ref=e425] [cursor=pointer]:
            - generic [ref=e426]:
              - generic [ref=e427]: 方(6/6)(345)
              - generic "先身後足" [ref=e428]: BF
            - generic [ref=e429]:
              - generic [ref=e430]: 隨機
              - generic [ref=e431]: 13:00
        - generic [ref=e432]:
          - generic "拖曳此處以互換整排客人" [ref=e433]: 腳1-4
          - generic "套餐 (100分) ⏳ 同步中..." [ref=e435] [cursor=pointer]:
            - generic [ref=e436]:
              - generic [ref=e437]: 方(1/6)(345)
              - generic "先身後足" [ref=e438]: BF
            - generic [ref=e439]:
              - generic [ref=e440]: 隨機
              - generic [ref=e441]: 13:01
        - generic [ref=e442]:
          - generic "拖曳此處以互換整排客人" [ref=e443]: 腳1-5
          - generic [ref=e444]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e445] [cursor=pointer]:
              - generic [ref=e446]:
                - generic [ref=e447]: 方(2/6)(345)
                - generic "先身後足" [ref=e448]: BF
              - generic [ref=e449]:
                - generic [ref=e450]: 隨機
                - generic [ref=e451]: 13:01
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e452] [cursor=pointer]:
              - generic [ref=e453]:
                - generic [ref=e454]: 楊(5/6)(345)
                - generic "先足後身" [ref=e455]: FB
              - generic [ref=e456]:
                - generic [ref=e457]: 隨機
                - generic [ref=e458]: 12:20
              - button "" [ref=e459]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e461] [cursor=pointer]:
              - generic [ref=e462]:
                - generic [ref=e463]: 康(2/4)(635)
                - generic "先身後足" [ref=e464]: BF
              - generic [ref=e465]:
                - generic [ref=e466]: 隨機
                - generic [ref=e467]: 17:11
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e468] [cursor=pointer]:
              - generic [ref=e469]:
                - generic [ref=e470]: 康(3/4)(635)
                - generic "先足後身" [ref=e471]: FB
              - generic [ref=e472]:
                - generic [ref=e473]: 隨機
                - generic [ref=e474]: 15:35
              - button "" [ref=e475]
        - generic [ref=e477]:
          - generic "拖曳此處以互換整排客人" [ref=e478]: 腳1-6
          - generic [ref=e479]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e480] [cursor=pointer]:
              - generic [ref=e481]:
                - generic [ref=e482]: 方(3/6)(345)
                - generic "先身後足" [ref=e483]: BF
              - generic [ref=e484]:
                - generic [ref=e485]: 隨機
                - generic [ref=e486]: 13:01
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e487] [cursor=pointer]:
              - generic [ref=e488]:
                - generic [ref=e489]: 楊(6/6)(345)
                - generic "先足後身" [ref=e490]: FB
              - generic [ref=e491]:
                - generic [ref=e492]: 隨機
                - generic [ref=e493]: 12:20
              - button "" [ref=e494]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e496] [cursor=pointer]:
              - generic [ref=e497]:
                - generic [ref=e498]: 康(1/4)(635)
                - generic "先身後足" [ref=e499]: BF
              - generic [ref=e500]:
                - generic [ref=e501]: 隨機
                - generic [ref=e502]: 17:11
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e503] [cursor=pointer]:
              - generic [ref=e504]:
                - generic [ref=e505]: 康(4/4)(635)
                - generic "先足後身" [ref=e506]: FB
              - generic [ref=e507]:
                - generic [ref=e508]: 隨機
                - generic [ref=e509]: 15:35
              - button "" [ref=e510]
        - generic [ref=e512]:
          - generic "拖曳此處以互換整排客人" [ref=e513]: 床1-1
          - generic [ref=e514]:
            - generic "身體按摩 (90分)" [ref=e515] [cursor=pointer]:
              - generic [ref=e516]: 葉(1/2)(342)
              - generic [ref=e518]:
                - generic [ref=e519]: 隨機
                - generic [ref=e520]: 14:01
              - button "" [ref=e521]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e523] [cursor=pointer]:
              - generic [ref=e524]:
                - generic [ref=e525]: 方(3/6)(345)
                - generic "先身後足" [ref=e526]: BF
              - generic [ref=e527]:
                - generic [ref=e528]: 隨機
                - generic [ref=e529]: 12:20
              - button "" [ref=e530]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e532] [cursor=pointer]:
              - generic [ref=e533]:
                - generic [ref=e534]: 康(2/4)(635)
                - generic "先身後足" [ref=e535]: BF
              - generic [ref=e536]:
                - generic [ref=e537]: 隨機
                - generic [ref=e538]: 15:35
              - button "" [ref=e539]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e541] [cursor=pointer]:
              - generic [ref=e542]:
                - generic [ref=e543]: 康(3/4)(635)
                - generic "先足後身" [ref=e544]: FB
              - generic [ref=e545]:
                - generic [ref=e546]: 隨機
                - generic [ref=e547]: 17:11
        - generic [ref=e548]:
          - generic "拖曳此處以互換整排客人" [ref=e549]: 床1-2
          - generic [ref=e550]:
            - generic "身體按摩 (90分)" [ref=e551] [cursor=pointer]:
              - generic [ref=e552]: 葉(2/2)(342)
              - generic [ref=e554]:
                - generic [ref=e555]: 隨機
                - generic [ref=e556]: 14:01
              - button "" [ref=e557]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e559] [cursor=pointer]:
              - generic [ref=e560]:
                - generic [ref=e561]: 方(2/6)(345)
                - generic "先身後足" [ref=e562]: BF
              - generic [ref=e563]:
                - generic [ref=e564]: 隨機
                - generic [ref=e565]: 12:20
              - button "" [ref=e566]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e568] [cursor=pointer]:
              - generic [ref=e569]:
                - generic [ref=e570]: 康(1/4)(635)
                - generic "先身後足" [ref=e571]: BF
              - generic [ref=e572]:
                - generic [ref=e573]: 隨機
                - generic [ref=e574]: 15:35
              - button "" [ref=e575]
            - generic "套餐 (190分) ⏳ 同步中..." [ref=e577] [cursor=pointer]:
              - generic [ref=e578]:
                - generic [ref=e579]: 康(4/4)(635)
                - generic "先足後身" [ref=e580]: FB
              - generic [ref=e581]:
                - generic [ref=e582]: 隨機
                - generic [ref=e583]: 17:11
        - generic [ref=e584]:
          - generic "拖曳此處以互換整排客人" [ref=e585]: 床1-3
          - generic [ref=e586]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e587] [cursor=pointer]:
              - generic [ref=e588]:
                - generic [ref=e589]: 方(1/6)(345)
                - generic "先身後足" [ref=e590]: BF
              - generic [ref=e591]:
                - generic [ref=e592]: 隨機
                - generic [ref=e593]: 12:20
              - button "" [ref=e594]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e596] [cursor=pointer]:
              - generic [ref=e597]:
                - generic [ref=e598]: 楊(3/6)(345)
                - generic "先足後身" [ref=e599]: FB
              - generic [ref=e600]:
                - generic [ref=e601]: 隨機
                - generic [ref=e602]: 13:01
            - generic "套餐 (190分)" [ref=e603] [cursor=pointer]:
              - generic [ref=e604]:
                - generic [ref=e605]: 高(2/4)(463)
                - generic "先足後身" [ref=e606]: FB
              - generic [ref=e607]:
                - generic [ref=e608]: 隨機
                - generic [ref=e609]: 17:41
            - generic "套餐 (190分)" [ref=e610] [cursor=pointer]:
              - generic [ref=e611]:
                - generic [ref=e612]: 高(3/4)(463)
                - generic "先身後足" [ref=e613]: BF
              - generic [ref=e614]:
                - generic [ref=e615]: 隨機
                - generic [ref=e616]: 16:05
              - button "" [ref=e617]
        - generic [ref=e619]:
          - generic "拖曳此處以互換整排客人" [ref=e620]: 床1-4
          - generic [ref=e621]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e622] [cursor=pointer]:
              - generic [ref=e623]:
                - generic [ref=e624]: 方(4/6)(345)
                - generic "先身後足" [ref=e625]: BF
              - generic [ref=e626]:
                - generic [ref=e627]: 隨機
                - generic [ref=e628]: 12:20
              - button "" [ref=e629]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e631] [cursor=pointer]:
              - generic [ref=e632]:
                - generic [ref=e633]: 楊(4/6)(345)
                - generic "先足後身" [ref=e634]: FB
              - generic [ref=e635]:
                - generic [ref=e636]: 隨機
                - generic [ref=e637]: 13:01
            - generic "套餐 (190分)" [ref=e638] [cursor=pointer]:
              - generic [ref=e639]:
                - generic [ref=e640]: 高(1/4)(463)
                - generic "先身後足" [ref=e641]: BF
              - generic [ref=e642]:
                - generic [ref=e643]: 隨機
                - generic [ref=e644]: 16:05
              - button "" [ref=e645]
            - generic "套餐 (190分)" [ref=e647] [cursor=pointer]:
              - generic [ref=e648]:
                - generic [ref=e649]: 高(4/4)(463)
                - generic "先足後身" [ref=e650]: FB
              - generic [ref=e651]:
                - generic [ref=e652]: 隨機
                - generic [ref=e653]: 17:41
        - generic [ref=e654]:
          - generic "拖曳此處以互換整排客人" [ref=e655]: 床1-5
          - generic [ref=e656]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e657] [cursor=pointer]:
              - generic [ref=e658]:
                - generic [ref=e659]: 方(5/6)(345)
                - generic "先身後足" [ref=e660]: BF
              - generic [ref=e661]:
                - generic [ref=e662]: 隨機
                - generic [ref=e663]: 12:20
              - button "" [ref=e664]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e666] [cursor=pointer]:
              - generic [ref=e667]:
                - generic [ref=e668]: 楊(5/6)(345)
                - generic "先足後身" [ref=e669]: FB
              - generic [ref=e670]:
                - generic [ref=e671]: 隨機
                - generic [ref=e672]: 13:01
        - generic [ref=e673]:
          - generic "拖曳此處以互換整排客人" [ref=e674]: 床1-6
          - generic [ref=e675]:
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e676] [cursor=pointer]:
              - generic [ref=e677]:
                - generic [ref=e678]: 方(6/6)(345)
                - generic "先身後足" [ref=e679]: BF
              - generic [ref=e680]:
                - generic [ref=e681]: 隨機
                - generic [ref=e682]: 12:20
              - button "" [ref=e683]
            - generic "套餐 (100分) ⏳ 同步中..." [ref=e685] [cursor=pointer]:
              - generic [ref=e686]:
                - generic [ref=e687]: 楊(6/6)(345)
                - generic "先足後身" [ref=e688]: FB
              - generic [ref=e689]:
                - generic [ref=e690]: 隨機
                - generic [ref=e691]: 13:01
```

# Test source

```ts
  1  | const { test, expect } = require('@playwright/test');
  2  | 
  3  | test.describe('Group COMBO to BODY Capacity Check', () => {
  4  |     test('Should calculate flowCode correctly for capacity check', async ({ page, request }) => {
  5  |         const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '/');
  6  |         
  7  |         // 1. Create a COMBO BF booking (starts with BED)
  8  |         await request.post('http://localhost:5001/api/admin-booking', {
  9  |             data: {
  10 |                 is_group_booking: false,
  11 |                 name: "Test Combo BF",
  12 |                 phone: "0911223344",
  13 |                 guestCount: 1,
  14 |                 service_code: "100", // Combo
  15 |                 duration: 120,
  16 |                 location: "本館",
  17 |                 date: dateStr,
  18 |                 startTime: "12:00",
  19 |                 type: "COMBO",
  20 |                 guests: [{ category: "COMBO", flow: "BF", duration: 120 }],
  21 |                 flow: "BF",
  22 |                 phase1_res_idx: "BED-1-1",
  23 |                 phase2_res_idx: "CHAIR-1-1",
  24 |             }
  25 |         });
  26 | 
  27 |         // 2. Open page
  28 |         await page.goto('http://localhost:5001/admin2/index.html');
> 29 |         await page.waitForSelector('.booking-block', { timeout: 30000 });
     |                    ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  30 |         
  31 |         // Click the booking
  32 |         const bookingCard = page.locator('.booking-block', { hasText: 'Test Combo BF' }).first();
  33 |         await bookingCard.click();
  34 |         
  35 |         // Wait for edit modal
  36 |         await page.waitForSelector('text=儲存修改', { timeout: 10000 });
  37 |         
  38 |         // Change to BODY
  39 |         const serviceSelect = page.locator('select').first();
  40 |         await serviceSelect.selectOption({ label: '身體按摩 (120分)' });
  41 |         
  42 |         // Ensure no "床區客滿" error
  43 |         const errorMsgLocator = page.locator('text=❌ 床區客滿');
  44 |         await expect(errorMsgLocator).not.toBeVisible({ timeout: 2000 });
  45 |         
  46 |         // Clean up: delete the booking
  47 |         const deleteBtn = page.locator('button[title="刪除預約"]');
  48 |         if (await deleteBtn.isVisible()) {
  49 |             await deleteBtn.click();
  50 |             await page.locator('button:has-text("確定刪除")').click();
  51 |         }
  52 |     });
  53 | });
  54 | 
```