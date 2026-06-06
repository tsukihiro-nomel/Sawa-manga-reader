!include "nsDialogs.nsh"
!include "LogicLib.nsh"

!define SAWA_BG 0x0E1424
!define SAWA_PANEL 0x141B30
!define SAWA_TEXT 0xF2F5FA
!define SAWA_MUTED 0x9AA6C0
!define SAWA_GOLD 0xD2A665

Var SawaDialog
Var SawaOcrCheckbox
Var SawaAssocCheckbox
Var SawaContextCheckbox
Var SawaDesktopCheckbox
Var SawaStartMenuCheckbox
Var SawaQuickLaunchCheckbox
Var SawaAutoStartCheckbox
Var SawaLaunchCheckbox
Var SawaScanCheckbox
Var SawaReadmeCheckbox
Var SawaKeepDataCheckbox
Var SawaKeepCacheCheckbox
Var SawaDesktopShortcut
Var SawaStartMenuShortcut
Var SawaQuickLaunchShortcut
Var SawaAutoStartShortcut
Var SawaLaunchAfterInstall
Var SawaScanAfterInstall
Var SawaReadmeAfterInstall
Var SawaKeepUserData
Var SawaKeepDerivedCache

!macro customWelcomePage
  Page custom SawaWelcomeCreate SawaWelcomeLeave
  Page custom SawaPrereqCreate SawaPrereqLeave
  Page custom SawaComponentsCreate SawaComponentsLeave
!macroend

!macro customPageAfterChangeDir
  Page custom SawaShortcutsCreate SawaShortcutsLeave
!macroend

!macro customFinishPage
  Page custom SawaFinishCreate SawaFinishLeave
!macroend

!macro customUnWelcomePage
  UninstPage custom un.SawaUninstallCreate un.SawaUninstallLeave
!macroend

!macro customCheckAppRunning
  ; Sawa garde le controle de sa fermeture. Le check NSIS par nom de process
  ; peut produire de faux positifs sur Windows et bloquer l'installation.
!macroend

!macro customInit
  StrCpy $SawaDesktopShortcut "1"
  StrCpy $SawaStartMenuShortcut "1"
  StrCpy $SawaQuickLaunchShortcut "0"
  StrCpy $SawaAutoStartShortcut "0"
  StrCpy $SawaLaunchAfterInstall "1"
  StrCpy $SawaScanAfterInstall "1"
  StrCpy $SawaReadmeAfterInstall "0"
  StrCpy $SawaKeepUserData "1"
  StrCpy $SawaKeepDerivedCache "0"

  ; Note: le nettoyage des anciens moteurs Suwayomi est desormais gere par
  ; le wrapper Electron (installer/main/suwayomiKill.cjs) avant d'invoquer
  ; ce backend. Le bloc PowerShell historique a ete retire pour eviter le
  ; double scan / double kill.
!macroend

!macro customInstall
  ${If} $SawaDesktopShortcut != "1"
    Delete "$DESKTOP\Sawa Manga Library.lnk"
  ${EndIf}
  ${If} $SawaStartMenuShortcut != "1"
    Delete "$SMPROGRAMS\Sawa Manga Library.lnk"
    Delete "$SMPROGRAMS\Sawa Manga Library\Sawa Manga Library.lnk"
  ${EndIf}
  ${If} $SawaQuickLaunchShortcut == "1"
    CreateShortCut "$QUICKLAUNCH\Sawa Manga Library.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
  ${If} $SawaAutoStartShortcut == "1"
    CreateShortCut "$SMSTARTUP\Sawa Manga Library.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${Else}
    Delete "$SMSTARTUP\Sawa Manga Library.lnk"
  ${EndIf}
!macroend

!macro customUnInstall
  ${If} $SawaKeepDerivedCache != "1"
    RMDir /r "$APPDATA\sawa-manga-library\cache"
    RMDir /r "$APPDATA\sawa-manga-library\derived"
  ${EndIf}
!macroend

Function SawaWelcomeCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Le Carnet de Sawa"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateLabel} 0 26u 100% 38u "Cet assistant installe Sawa Manga Library avec le theme Midnight Ember, le runtime Sources web et les chemins locaux propres."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  ${NSD_CreateLabel} 0 74u 100% 18u "Conseil: ferme Sawa avant de continuer. L'installateur nettoie aussi les anciens java.exe Suwayomi lances par Sawa."
  Pop $0
  SetCtlColors $0 ${SAWA_GOLD} ${SAWA_BG}
  ${NSD_CreateLabel} 0 110u 100% 30u "Signature du package verifiee. Installation locale-first: tes bibliotheques et donnees utilisateur restent sous ton controle."
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_PANEL}
  nsDialogs::Show
FunctionEnd

Function SawaWelcomeLeave
FunctionEnd

Function SawaPrereqCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Verification rapide"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateLabel} 0 28u 100% 16u "Windows 10/11 64-bit: pret"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 48u 100% 16u "Espace disque: verifie par l'installateur"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 68u 100% 16u "Runtime Sources web: inclus dans les ressources Sawa"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 88u 100% 16u "Java/Suwayomi fantomes: nettoyage automatique avant copie"
  Pop $0
  SetCtlColors $0 ${SAWA_GOLD} ${SAWA_BG}
  ${NSD_CreateLabel} 0 118u 100% 24u "Si une ancienne installation existe, elle sera mise a jour sans toucher a tes mangas ni a tes donnees utilisateur."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  nsDialogs::Show
FunctionEnd

Function SawaPrereqLeave
FunctionEnd

Function SawaComponentsCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Composants"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateLabel} 0 24u 100% 16u "Toujours installe: coeur Sawa, lecteur, bibliotheque locale, Sources web et moteur Suwayomi integre."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  ${NSD_CreateCheckbox} 0 56u 100% 12u "OCR local et outils de maintenance"
  Pop $SawaOcrCheckbox
  ${NSD_SetState} $SawaOcrCheckbox ${BST_UNCHECKED}
  ${NSD_CreateCheckbox} 0 76u 100% 12u "Associer les formats manga supportes a Sawa"
  Pop $SawaAssocCheckbox
  ${NSD_SetState} $SawaAssocCheckbox ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 96u 100% 12u "Ajouter les actions Sawa au menu contextuel Explorateur"
  Pop $SawaContextCheckbox
  ${NSD_SetState} $SawaContextCheckbox ${BST_CHECKED}
  ${NSD_CreateLabel} 0 126u 100% 18u "Les options avancees restent discretes dans l'application. Le flux normal de lecture reste propre et calme."
  Pop $0
  SetCtlColors $0 ${SAWA_GOLD} ${SAWA_BG}
  nsDialogs::Show
FunctionEnd

Function SawaComponentsLeave
FunctionEnd

Function SawaShortcutsCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Raccourcis et lancement"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateCheckbox} 0 32u 100% 12u "Creer un raccourci sur le Bureau"
  Pop $SawaDesktopCheckbox
  ${If} $SawaDesktopShortcut == "1"
    ${NSD_SetState} $SawaDesktopCheckbox ${BST_CHECKED}
  ${EndIf}
  ${NSD_CreateCheckbox} 0 52u 100% 12u "Creer un raccourci dans le menu Demarrer"
  Pop $SawaStartMenuCheckbox
  ${If} $SawaStartMenuShortcut == "1"
    ${NSD_SetState} $SawaStartMenuCheckbox ${BST_CHECKED}
  ${EndIf}
  ${NSD_CreateCheckbox} 0 72u 100% 12u "Ajouter un raccourci Acces rapide"
  Pop $SawaQuickLaunchCheckbox
  ${If} $SawaQuickLaunchShortcut == "1"
    ${NSD_SetState} $SawaQuickLaunchCheckbox ${BST_CHECKED}
  ${EndIf}
  ${NSD_CreateCheckbox} 0 92u 100% 12u "Lancer Sawa au demarrage de Windows"
  Pop $SawaAutoStartCheckbox
  ${If} $SawaAutoStartShortcut == "1"
    ${NSD_SetState} $SawaAutoStartCheckbox ${BST_CHECKED}
  ${EndIf}
  ${NSD_CreateLabel} 0 124u 100% 18u "Tu peux tout changer plus tard. Par defaut, Sawa reste discret."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  nsDialogs::Show
FunctionEnd

Function SawaShortcutsLeave
  ${NSD_GetState} $SawaDesktopCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaDesktopShortcut "1"
  ${Else}
    StrCpy $SawaDesktopShortcut "0"
  ${EndIf}
  ${NSD_GetState} $SawaStartMenuCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaStartMenuShortcut "1"
  ${Else}
    StrCpy $SawaStartMenuShortcut "0"
  ${EndIf}
  ${NSD_GetState} $SawaQuickLaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaQuickLaunchShortcut "1"
  ${Else}
    StrCpy $SawaQuickLaunchShortcut "0"
  ${EndIf}
  ${NSD_GetState} $SawaAutoStartCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaAutoStartShortcut "1"
  ${Else}
    StrCpy $SawaAutoStartShortcut "0"
  ${EndIf}
FunctionEnd

Function SawaFinishCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Sawa est prete"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateLabel} 0 28u 100% 22u "Installation terminee. Tu peux lancer l'application maintenant ou ouvrir le guide de demarrage plus tard."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  ${NSD_CreateCheckbox} 0 62u 100% 12u "Lancer Sawa Manga Library"
  Pop $SawaLaunchCheckbox
  ${NSD_SetState} $SawaLaunchCheckbox ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 82u 100% 12u "Lancer un premier scan silencieux au demarrage"
  Pop $SawaScanCheckbox
  ${NSD_SetState} $SawaScanCheckbox ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 102u 100% 12u "Ouvrir le README"
  Pop $SawaReadmeCheckbox
  ${NSD_SetState} $SawaReadmeCheckbox ${BST_UNCHECKED}
  ${NSD_CreateLabel} 0 134u 100% 16u "Merci d'avoir installe Sawa. Bonne lecture."
  Pop $0
  SetCtlColors $0 ${SAWA_GOLD} ${SAWA_BG}
  nsDialogs::Show
FunctionEnd

Function SawaFinishLeave
  ${NSD_GetState} $SawaLaunchCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    Exec "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${EndIf}
  ${NSD_GetState} $SawaReadmeCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    ExecShell "open" "https://github.com/"
  ${EndIf}
FunctionEnd

Function un.SawaUninstallCreate
  nsDialogs::Create 1018
  Pop $SawaDialog
  SetCtlColors $SawaDialog ${SAWA_TEXT} ${SAWA_BG}
  ${NSD_CreateLabel} 0 0 100% 18u "Desinstaller Sawa"
  Pop $0
  SetCtlColors $0 ${SAWA_TEXT} ${SAWA_BG}
  CreateFont $1 "Segoe UI" 12 700
  SendMessage $0 ${WM_SETFONT} $1 0
  ${NSD_CreateLabel} 0 28u 100% 26u "Sawa va retirer l'application. Tes mangas et tes donnees utilisateur sont preserves par defaut."
  Pop $0
  SetCtlColors $0 ${SAWA_MUTED} ${SAWA_BG}
  ${NSD_CreateCheckbox} 0 66u 100% 12u "Conserver les donnees utilisateur"
  Pop $SawaKeepDataCheckbox
  ${NSD_SetState} $SawaKeepDataCheckbox ${BST_CHECKED}
  ${NSD_CreateCheckbox} 0 86u 100% 12u "Conserver les caches derives"
  Pop $SawaKeepCacheCheckbox
  ${NSD_SetState} $SawaKeepCacheCheckbox ${BST_UNCHECKED}
  ${NSD_CreateLabel} 0 120u 100% 18u "Le runtime Sources web est arrete si un ancien processus Sawa/Suwayomi reste en arriere-plan."
  Pop $0
  SetCtlColors $0 ${SAWA_GOLD} ${SAWA_BG}
  nsDialogs::Show
FunctionEnd

Function un.SawaUninstallLeave
  ${NSD_GetState} $SawaKeepDataCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaKeepUserData "1"
  ${Else}
    StrCpy $SawaKeepUserData "0"
  ${EndIf}
  ${NSD_GetState} $SawaKeepCacheCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SawaKeepDerivedCache "1"
  ${Else}
    StrCpy $SawaKeepDerivedCache "0"
  ${EndIf}
FunctionEnd
