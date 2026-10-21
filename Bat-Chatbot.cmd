@echo off
chcp 65001 >nul
title Ga - ChatMock
node "%~dp0deploy\desktop-launcher.mjs"
if errorlevel 1 pause
