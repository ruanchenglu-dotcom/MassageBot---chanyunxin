with open(r'qinshihuang/js/cyx_bookingHandler.js', 'r', encoding='utf-8') as f:
    content = f.read()

target_buttons = """                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('對面館'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '對面館' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >對面館</button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('跨館套餐'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '跨館套餐' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >跨館套餐</button>"""

if target_buttons in content:
    content = content.replace(target_buttons, """                                    {/* <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('對面館'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '對面館' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >對面館</button>
                                    <button 
                                        onClick={(e) => { e.preventDefault(); setSelectedLocation('跨館套餐'); setCheckResult(null); setSuggestions([]); }} 
                                        className={`px-4 py-1.5 rounded-md font-bold text-sm sm:text-base transition-all ${selectedLocation === '跨館套餐' ? 'bg-white text-[#0891b2] shadow-md' : 'text-white hover:bg-white/10'}`}
                                    >跨館套餐</button> */}""")
    print("Replaced cyx_bookingHandler.js successfully")
else:
    print("Could not find target buttons in cyx_bookingHandler.js")

with open(r'qinshihuang/js/cyx_bookingHandler.js', 'w', encoding='utf-8') as f:
    f.write(content)
