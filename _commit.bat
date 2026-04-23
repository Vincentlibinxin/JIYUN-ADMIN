@echo off
cd /d "c:\Users\kongf\Desktop\集运系统\JIYUN-ADMIN"
git add -A
git commit -m "feat(v0.2.15): add soft-delete column; default filter excludes deleted records"
git tag v0.2.15
git push
git push --tags
