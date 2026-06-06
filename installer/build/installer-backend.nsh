; installer-backend.nsh - silent NSIS backend for the custom Electron UI.
; Included by electron-builder's NSIS template.

!define SAWA_BACKEND 1
!define UNINSTALL_WRAPPER 1

Var SawaLogFile
Var SawaLogHandle
Var SawaPercent
Var SawaTask
Var SawaUiBundle
Var SawaLibraryPath
Var SawaStartMenu
Var SawaShortcutDesktop
Var SawaShortcutStartMenu
Var SawaShortcutAutostart
Var SawaNoShortcuts
Var SawaComponentAssoc
Var SawaComponentContext
Var SawaExePath
Var SawaScopeArg

!macro SawaLog _line
  ${If} $SawaLogFile != ""
    FileOpen $SawaLogHandle "$SawaLogFile" a
    ${If} $SawaLogHandle != ""
      FileSeek $SawaLogHandle 0 END
      FileWrite $SawaLogHandle "${_line}$\r$\n"
      FileClose $SawaLogHandle
    ${EndIf}
  ${EndIf}
!macroend
!define SawaLog "!insertmacro SawaLog"

!macro SawaProgress _value
  StrCpy $SawaPercent ${_value}
  ${SawaLog} "Progress: ${_value}"
!macroend
!define SawaProgress "!insertmacro SawaProgress"

!macro SawaTask _label
  StrCpy $SawaTask "${_label}"
  ${SawaLog} "Task: ${_label}"
!macroend
!define SawaTask "!insertmacro SawaTask"

!macro ReadOption _params _flag _var _fallback
  ${GetOptions} ${_params} "${_flag}" ${_var}
  ${If} ${Errors}
    ClearErrors
    StrCpy ${_var} "${_fallback}"
  ${EndIf}
!macroend
!define ReadOption "!insertmacro ReadOption"

!macro RegisterMangaExtension _ext
  WriteRegStr SHELL_CONTEXT "Software\Classes\.${_ext}" "" "SawaMangaArchive"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SawaMangaArchive" "" "Sawa Manga Archive"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SawaMangaArchive\DefaultIcon" "" "$SawaExePath,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SawaMangaArchive\shell" "" "open"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SawaMangaArchive\shell\open" "" "Open with Sawa"
  WriteRegStr SHELL_CONTEXT "Software\Classes\SawaMangaArchive\shell\open\command" "" "$\"$SawaExePath$\" $\"%1$\""
!macroend
!define RegisterMangaExtension "!insertmacro RegisterMangaExtension"

!macro customInit
  ${GetParameters} $R0

  ${ReadOption} $R0 "/LOG=" $SawaLogFile "$TEMP\sawa-backend.log"
  ${ReadOption} $R0 "/UIBUNDLE=" $SawaUiBundle ""
  ${ReadOption} $R0 "/LIBPATH=" $SawaLibraryPath ""
  ${ReadOption} $R0 "/STARTMENU=" $SawaStartMenu "Sawa Manga Library"
  ${ReadOption} $R0 "/SC_DESKTOP=" $SawaShortcutDesktop "1"
  ${ReadOption} $R0 "/SC_STARTMENU=" $SawaShortcutStartMenu "1"
  ${ReadOption} $R0 "/SC_AUTOSTART=" $SawaShortcutAutostart "0"
  ${ReadOption} $R0 "/COMP_ASSOC=" $SawaComponentAssoc "1"
  ${ReadOption} $R0 "/COMP_CTX=" $SawaComponentContext "0"
  ${ReadOption} $R0 "/NOSHORTCUTS=" $SawaNoShortcuts "0"

  StrCpy $SawaExePath "$INSTDIR\Sawa Manga Library.exe"
  ${If} $installMode == "all"
    StrCpy $SawaScopeArg "allUsers"
  ${Else}
    StrCpy $SawaScopeArg "currentUser"
  ${EndIf}

  ${SawaLog} "Sawa Installer Backend - start"
  ${SawaProgress} 0
  ${SawaTask} "Preparation"
!macroend

!macro customInstall
  StrCpy $SawaExePath "$INSTDIR\Sawa Manga Library.exe"

  ${SawaTask} "Extraction des fichiers"
  ${SawaProgress} 10
  ${SawaLog} "Extract: $INSTDIR\resources\app.asar"
  ${SawaProgress} 32
  ${SawaLog} "Extract: $INSTDIR\resources\app.asar.unpacked\better-sqlite3"
  ${SawaProgress} 42
  ${SawaTask} "Runtime Suwayomi"
  ${SawaLog} "Installing: vendor\suwayomi\Suwayomi-Server.jar"
  ${SawaProgress} 62
  ${SawaLog} "Installing: vendor\jre21"
  ${SawaProgress} 72

  ${SawaTask} "Registre & protocoles"
  ${SawaLog} "Registry: SHELL_CONTEXT\Software\Sawa\Setup\InstallDir = $INSTDIR"
  WriteRegStr SHELL_CONTEXT "Software\Sawa\Setup" "InstallDir" "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "Software\Sawa\Setup" "Version" "${VERSION}"
  WriteRegStr SHELL_CONTEXT "Software\Sawa\Setup" "LibraryPath" "$SawaLibraryPath"
  WriteRegStr SHELL_CONTEXT "Software\Sawa\Setup" "Scope" "$SawaScopeArg"

  WriteRegStr SHELL_CONTEXT "Software\Classes\sawa" "" "URL:Sawa Protocol"
  WriteRegStr SHELL_CONTEXT "Software\Classes\sawa" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\sawa\DefaultIcon" "" "$SawaExePath,0"
  WriteRegStr SHELL_CONTEXT "Software\Classes\sawa\shell\open\command" "" "$\"$SawaExePath$\" $\"%1$\""
  ${SawaLog} "Registry: protocole sawa:// enregistre"

  ${If} $SawaComponentAssoc == "1"
    ${RegisterMangaExtension} "cbz"
    ${RegisterMangaExtension} "cbr"
    ${RegisterMangaExtension} "cb7"
    ${RegisterMangaExtension} "pdf"
    ${SawaLog} "Registry: associations .cbz .cbr .cb7 .pdf"
  ${Else}
    DeleteRegKey SHELL_CONTEXT "Software\Classes\SawaMangaArchive"
  ${EndIf}

  ${If} $SawaComponentContext == "1"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\SawaMangaLibrary" "" "Ouvrir avec Sawa"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\SawaMangaLibrary" "Icon" "$SawaExePath"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\shell\SawaMangaLibrary\command" "" "$\"$SawaExePath$\" $\"%1$\""
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\SawaMangaLibrary" "" "Ouvrir avec Sawa"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\SawaMangaLibrary" "Icon" "$SawaExePath"
    WriteRegStr SHELL_CONTEXT "Software\Classes\Directory\Background\shell\SawaMangaLibrary\command" "" "$\"$SawaExePath$\" $\"%V$\""
    ${SawaLog} "Registry: menu contextuel Explorateur"
  ${Else}
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\SawaMangaLibrary"
    DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\Background\shell\SawaMangaLibrary"
  ${EndIf}
  ${SawaProgress} 80

  ${SawaTask} "Raccourcis"
  ${If} $SawaNoShortcuts != "1"
    ${If} $SawaShortcutDesktop == "1"
      CreateShortCut "$DESKTOP\Sawa Manga Library.lnk" "$SawaExePath"
      ${SawaLog} "Shortcut: $DESKTOP\Sawa Manga Library.lnk"
    ${Else}
      Delete "$DESKTOP\Sawa Manga Library.lnk"
    ${EndIf}

    ${If} $SawaShortcutStartMenu == "1"
      CreateDirectory "$SMPROGRAMS\$SawaStartMenu"
      CreateShortCut "$SMPROGRAMS\$SawaStartMenu\Sawa Manga Library.lnk" "$SawaExePath"
      CreateShortCut "$SMPROGRAMS\$SawaStartMenu\Desinstaller Sawa.lnk" "$INSTDIR\uninstall\installer-ui.exe" "--uninstall --scope=$SawaScopeArg --origin=$\"$INSTDIR$\""
      ${SawaLog} "Shortcut: $SMPROGRAMS\$SawaStartMenu"
    ${EndIf}

    ${If} $SawaShortcutAutostart == "1"
      CreateShortCut "$SMSTARTUP\Sawa Manga Library.lnk" "$SawaExePath" "--minimized"
      ${SawaLog} "Shortcut: startup"
    ${Else}
      Delete "$SMSTARTUP\Sawa Manga Library.lnk"
    ${EndIf}
  ${Else}
    Delete "$DESKTOP\Sawa Manga Library.lnk"
    Delete "$SMSTARTUP\Sawa Manga Library.lnk"
  ${EndIf}
  ${SawaProgress} 88

  ${SawaTask} "Desinstallateur"
  CreateDirectory "$INSTDIR\uninstall"
  ${If} $SawaUiBundle != ""
    ${If} ${FileExists} "$SawaUiBundle\installer-ui.exe"
      RMDir /r "$INSTDIR\uninstall"
      CreateDirectory "$INSTDIR\uninstall"
      CopyFiles /SILENT "$SawaUiBundle\*.*" "$INSTDIR\uninstall"
      CopyFiles /SILENT "$SawaUiBundle\installer-ui.exe" "$INSTDIR\uninstall\installer-ui.exe"
      CreateDirectory "$INSTDIR\uninstall\resources"
      CopyFiles /SILENT "$SawaUiBundle\resources\*.*" "$INSTDIR\uninstall\resources"
      CreateDirectory "$INSTDIR\uninstall\resources\backend"
      CopyFiles /SILENT "$SawaUiBundle\resources\backend\*.*" "$INSTDIR\uninstall\resources\backend"
      CreateDirectory "$INSTDIR\uninstall\resources\services"
      CopyFiles /SILENT "$SawaUiBundle\resources\services\*.*" "$INSTDIR\uninstall\resources\services"
      ${SawaLog} "Copy: $SawaUiBundle -> $INSTDIR\uninstall"
    ${EndIf}
  ${EndIf}

  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "DisplayName" "Sawa Manga Library"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "DisplayVersion" "${VERSION}"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "Publisher" "Sawahiro"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "InstallLocation" "$INSTDIR"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "DisplayIcon" "$SawaExePath,0"
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "UninstallString" "$\"$INSTDIR\uninstall\installer-ui.exe$\" --uninstall --scope=$SawaScopeArg --origin=$\"$INSTDIR$\""
  WriteRegStr SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "QuietUninstallString" "$\"$INSTDIR\uninstall\installer-ui.exe$\" --uninstall --scope=$SawaScopeArg --origin=$\"$INSTDIR$\" --silent"
  WriteRegDWORD SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "NoModify" 1
  WriteRegDWORD SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary" "NoRepair" 1
  ${SawaProgress} 95

  ${SawaTask} "Termine"
  ${SawaProgress} 100
  ${SawaLog} "Done."
!macroend

!macro customUnInstall
  StrCpy $SawaExePath "$INSTDIR\Sawa Manga Library.exe"
  ${SawaTask} "Suppression du programme"
  ${SawaProgress} 20
  ${SawaLog} "Registry: cleanup SHELL_CONTEXT\Software\Sawa"
  DeleteRegKey SHELL_CONTEXT "Software\Sawa"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\sawa"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\SawaMangaArchive"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\shell\SawaMangaLibrary"
  DeleteRegKey SHELL_CONTEXT "Software\Classes\Directory\Background\shell\SawaMangaLibrary"
  DeleteRegKey SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\SawaMangaLibrary"
  Delete "$DESKTOP\Sawa Manga Library.lnk"
  Delete "$SMSTARTUP\Sawa Manga Library.lnk"
  ${SawaProgress} 60
  ${SawaLog} "Done."
!macroend

!macro customCheckAppRunning
  ; The Electron wizard handles process detection.
!macroend

; electron-builder's handleUninstallResult calls these hooks (installUtil.nsh)
; instead of its default behaviour, which pops a blocking native MessageBox
; ("$(uninstallFailed): <code>") and aborts with SetErrorLevel 2 / Quit when the
; previous version's uninstaller returns non-zero. That dialog appears even in
; silent mode and stacks ON TOP of our frameless wizard window. The Electron
; shell already terminates any running Sawa instance before this runs, and
; installApplicationFiles overwrites the old files next — so a non-zero result
; must only be logged, never block the UI nor abort the update. $R0 holds the
; old-uninstaller exit code; the error flag is set if it could not be launched.
!macro customUnInstallCheck
  ${If} ${Errors}
    ClearErrors
    ${SawaLog} "Warn: ancien desinstallateur introuvable - poursuite de la mise a jour"
  ${ElseIf} $R0 != 0
    ${SawaLog} "Warn: ancienne version code $R0 - fichiers remplaces en place"
  ${Else}
    ${SawaLog} "Ancienne version retiree proprement"
  ${EndIf}
!macroend

!macro customUnInstallCheckCurrentUser
  ${If} ${Errors}
    ClearErrors
    ${SawaLog} "Warn: ancien desinstallateur (utilisateur) introuvable - poursuite"
  ${ElseIf} $R0 != 0
    ${SawaLog} "Warn: ancienne version utilisateur code $R0 - fichiers remplaces"
  ${Else}
    ${SawaLog} "Ancienne version utilisateur retiree proprement"
  ${EndIf}
!macroend
