@echo off
chcp 65001 >nul
title Ga - Dang nhap ChatMock
pushd "%~dp0"
python ChatMock-main/chatmock.py login
popd
pause
