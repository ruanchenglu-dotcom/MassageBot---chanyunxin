@echo off
echo Dang day code len kho hien tai (chanyunxin)...
git add .
git commit -m "%*"
git push origin main

echo.
echo Dang day code sang kho ruanchenglu1-lab/massage-bot-zhongli (Render)...
git push https://github.com/ruanchenglu1-lab/massage-bot-zhongli.git main --force

echo.
echo XONG! Code da len va Render se tu chay.