; Installer hooks (see bundle.windows.nsis.installerHooks in tauri.conf.json).
;
; Removes Hex Cards 1.0 ("HexCards", an older Electron app with its own installer) before installing.
; Earlier 2.0 versions don't need this: they share the app identifier, so the installer upgrades them.
; 1.0 registered itself under its app ID's uninstall key, per user (HKCU) or for all users (HKLM).

!include LogicLib.nsh

!define HEXCARDS1_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\ac0c93b6-0c55-5bb4-8fda-fad95fc5fcee"

!macro NSIS_HOOK_PREINSTALL
  ; Installed just for this user: remove it silently.
  ReadRegStr $R0 HKCU "${HEXCARDS1_UNINSTALL_KEY}" "QuietUninstallString"
  ${If} $R0 != ""
    DetailPrint "Removing HexCards 1.0..."
    ExecWait '$R0'
    ; The old uninstaller can hand off to a copy of itself and return early; wait until its entry is gone.
    StrCpy $R1 0
    ${Do}
      ReadRegStr $R0 HKCU "${HEXCARDS1_UNINSTALL_KEY}" "QuietUninstallString"
      ${If} $R0 == ""
      ${OrIf} $R1 >= 30
        ${Break}
      ${EndIf}
      Sleep 1000
      IntOp $R1 $R1 + 1
    ${Loop}
  ${EndIf}

  ; Installed for all users: removing it needs administrator rights, so ask first.
  ; Only asked while that copy exists; fully silent installs (/S) answer No without asking.
  ReadRegStr $R0 HKLM "${HEXCARDS1_UNINSTALL_KEY}" "QuietUninstallString"
  ${If} $R0 != ""
    MessageBox MB_YESNO|MB_ICONQUESTION "An older version, HexCards 1.0, is also installed for all users on this PC.$\r$\n$\r$\nRemove it now? Windows will ask for administrator permission." /SD IDNO IDNO hexcards1_keep
      DetailPrint "Removing HexCards 1.0 (all users)..."
      ExecShellWait "runas" "$SYSDIR\cmd.exe" '/c "$R0"' SW_HIDE
    hexcards1_keep:
  ${EndIf}
!macroend
