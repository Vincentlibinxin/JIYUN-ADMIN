@echo off
cd /d "c:\Users\kongf\Desktop\集运系统\JIYUN-ADMIN"
del _commit.bat
git add -A
git commit -m "chore: remove temp commit script"
git push
del _cleanup.bat
