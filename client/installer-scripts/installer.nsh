; Custom NSIS installer script for Phonolytics
; This script shows prerequisites checklist before installation

!include "MUI2.nsh"
!include "LogicLib.nsh"

; Custom page for prerequisites checklist
Page custom PrerequisitesPage

; Function to show prerequisites checklist
Function PrerequisitesPage
    MessageBox MB_YESNO|MB_ICONQUESTION "Phonolytics Prerequisites Checklist$\r$\n$\r$\nBefore installing, please ensure you have:$\r$\n$\r$\n✓ Python 3.8+ installed (from python.org)$\r$\n✓ Python added to system PATH$\r$\n✓ Administrative privileges$\r$\n✓ Internet connection available$\r$\n$\r$\nHave you verified all prerequisites above?" IDYES ContinueInstall IDNO CancelInstall
    
    CancelInstall:
        MessageBox MB_OK "Installation cancelled.$\r$\n$\r$\nTo install Phonolytics:$\r$\n1. Install Python from python.org$\r$\n2. Make sure to check 'Add Python to PATH'$\r$\n3. Run this installer again"
        Abort
        
    ContinueInstall:
        ; Continue with installation
FunctionEnd

; Post-installation reminder
Function .onInstSuccess
    MessageBox MB_OK "Phonolytics installed successfully!$\r$\n$\r$\nIMPORTANT: Before using the app, run this command:$\r$\n$\r$\npip install fastapi uvicorn websocket-client pyaudiowpatch$\r$\n$\r$\nFor help and documentation:$\r$\nhttps://github.com/shayan-zaheer/Phonolytics-DesktopApp"
FunctionEnd
