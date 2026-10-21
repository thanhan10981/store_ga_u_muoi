@echo off
chcp 65001 >nul
title Ga - Dung ChatMock
node "%~dp0deploy\desktop-launcher.mjs" --stop
pause
