import io
import re

file_path = 'XinWuChanAdmin/js/cyx_bookingHandler.js'
with io.open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

content = re.sub(
    r'handleGuestUpdate\(i, \'toggleYouTui\'\); \}\}\s*disabled=\{svcCode\.startsWith\(\'F\'\)\}',
    r'handleGuestUpdate(i, \'toggleYouTui\'); }}\n                                disabled={disabledYouTui}',
    content
)
content = content.replace(
    "${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isYouTui ?",
    "${disabledYouTui ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300 opacity-50' : (g.isYouTui ?"
)

content = re.sub(
    r'handleGuestUpdate\(i, \'toggleGuaSha\'\); \}\}\s*disabled=\{svcCode\.startsWith\(\'F\'\)\}',
    r'handleGuestUpdate(i, \'toggleGuaSha\'); }}\n                                disabled={disabledGuaSha}',
    content
)
content = content.replace(
    "${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isGuaSha ?",
    "${disabledGuaSha ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300 opacity-50' : (g.isGuaSha ?"
)

content = re.sub(
    r'handleGuestUpdate\(i, \'toggleHuaGuan\'\); \}\}\s*disabled=\{svcCode\.startsWith\(\'F\'\)\}',
    r'handleGuestUpdate(i, \'toggleHuaGuan\'); }}\n                                disabled={disabledHuaGuan}',
    content
)
content = content.replace(
    "${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isHuaGuan ?",
    "${disabledHuaGuan ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300 opacity-50' : (g.isHuaGuan ?"
)

content = re.sub(
    r'handleGuestUpdate\(i, \'toggleBaGuan\'\); \}\}\s*disabled=\{svcCode\.startsWith\(\'F\'\)\}',
    r'handleGuestUpdate(i, \'toggleBaGuan\'); }}\n                                disabled={disabledBaGuan}',
    content
)
content = content.replace(
    "${svcCode.startsWith('F') ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300' : (g.isBaGuan ?",
    "${disabledBaGuan ? 'bg-gray-200 text-gray-400 cursor-not-allowed border-gray-300 opacity-50' : (g.isBaGuan ?"
)

with io.open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
