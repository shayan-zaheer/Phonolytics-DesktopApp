; Basic NSIS installer script for Phonolytics
; This will be included by electron-builder

!include "MUI2.nsh"

; Show prerequisites before installation starts
!macro customInstall
    MessageBox MB_OK "PHONOLYTICS - REQUIRED APPLICATIONS$\n$\n\
    After installing Phonolytics, you need to install:$\n$\n\
    • PYTHON 3.8 or newer (from python.org)$\n$\n\
    That's it! Phonolytics will handle the rest.$\n$\n\
    Click OK to continue installation."
!macroend
