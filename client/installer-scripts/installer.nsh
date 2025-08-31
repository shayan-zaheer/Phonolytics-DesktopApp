; Custom NSIS installer script for Phonolytics
; This script checks for Python installation during setup

!include "MUI2.nsh"
!include "LogicLib.nsh"

; Variables
Var PythonFound
Var InstallPython

; Function to check if Python is installed
Function CheckPython
    StrCpy $PythonFound "false"
    
    ; Check if python.exe is accessible
    nsExec::ExecToStack 'python --version'
    Pop $0 ; exit code
    Pop $1 ; output
    
    ${If} $0 == 0
        StrCpy $PythonFound "true"
        DetailPrint "Python is already installed: $1"
    ${Else}
        DetailPrint "Python not found in system"
    ${EndIf}
FunctionEnd

; Function to ask user about Python installation
Function AskPythonInstall
    ${If} $PythonFound == "false"
        MessageBox MB_YESNO "Python is required for Phonolytics to function. Python was not found on your system. Would you like to download Python after installation?" IDYES WantPython IDNO SkipPython
        
        WantPython:
            StrCpy $InstallPython "true"
            Goto PythonEnd
            
        SkipPython:
            MessageBox MB_OK "Python installation was skipped. Phonolytics will not work without Python. Please install Python from python.org manually."
            StrCpy $InstallPython "false"
            Goto PythonEnd
            
        PythonEnd:
    ${Else}
        StrCpy $InstallPython "false"
    ${EndIf}
FunctionEnd

; Function to install Python packages if Python is available
Function InstallPackages
    ${If} $PythonFound == "true"
        DetailPrint "Installing required Python packages..."
        
        nsExec::ExecToLog 'python -m pip install --upgrade pip'
        nsExec::ExecToLog 'python -m pip install fastapi uvicorn websocket-client pyaudiowpatch'
        
        DetailPrint "Python packages installation completed"
    ${EndIf}
FunctionEnd

; Main installer section
Section "Python Prerequisites Check" SEC01
    Call CheckPython
    Call AskPythonInstall
    Call InstallPackages
SectionEnd

; Post-installation actions
Function .onInstSuccess
    ${If} $InstallPython == "true"
        DetailPrint "Opening Python download page..."
        ExecShell "open" "https://www.python.org/downloads/"
        MessageBox MB_OK "Python download page has been opened in your browser. Please download and install Python, then restart Phonolytics. Make sure to check Add Python to PATH during installation."
    ${EndIf}
FunctionEnd
