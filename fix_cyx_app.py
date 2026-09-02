with open(r'qinshihuang/js/cyx_app.js', 'r', encoding='utf-8') as f:
    content = f.read()

target_button = """                    <button onClick={() => setActiveTab('timeline-opp')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'timeline-opp' ? 'bg-teal-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-teal-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-store"></i> <span className="hidden md:inline">{window.SYSTEM_CONFIG?.UI_LABELS?.OPP_BRANCH || '對面館'}</span></button>"""

if target_button in content:
    content = content.replace(target_button, """                    {/* <button onClick={() => setActiveTab('timeline-opp')} className={`px-3 py-1.5 rounded-lg font-bold text-sm flex gap-2 items-center transition-all shadow-lg ${activeTab === 'timeline-opp' ? 'bg-teal-600 text-white ring-2 ring-white scale-105 opacity-100' : 'bg-teal-600 text-white/90 opacity-60 hover:opacity-100 hover:scale-105'}`}><i className="fas fa-store"></i> <span className="hidden md:inline">{window.SYSTEM_CONFIG?.UI_LABELS?.OPP_BRANCH || '對面館'}</span></button> */}""")
    print("Replaced cyx_app.js successfully")
else:
    print("Could not find the target button in cyx_app.js")

with open(r'qinshihuang/js/cyx_app.js', 'w', encoding='utf-8') as f:
    f.write(content)
