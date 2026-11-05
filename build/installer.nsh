!include nsDialogs.nsh
!include LogicLib.nsh
!include FileFunc.nsh
!include MUI2.nsh
!include "${BUILD_RESOURCES_DIR}\shell-exec-result.nsh"
!system '"${NSISDIR}\makensis.exe" /V2 "/DOUTPUT_FILE=${BUILD_RESOURCES_DIR}\browser-setup-helper.exe" "${BUILD_RESOURCES_DIR}\browser-setup-helper.nsi"' = 0

!ifndef BUILD_UNINSTALLER
; Downloaderr ships its own browser extension (loaded from the app's folder), so
; setup no longer asks Chrome/Edge to install a store listing. After a fresh
; install the app opens its Browser extension window with the steps.
!macro customFinishPage
  Function StartApp
    ${If} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 "--browser-setup"
    ${EndIf}
    ; Launch the executable installed by THIS wizard, not an older shortcut.
    ${StdUtils.ExecShellAsUser} $0 "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "open" "$1"
  FunctionEnd
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend
!endif

; Older versions could register the upstream store extension through browser
; policy. Uninstall still removes that registration.
!macro customUnInstall
  ${IfNot} ${isUpdated}
    ReadRegDWORD $0 SHCTX "${INSTALL_REGISTRY_KEY}" "AutomaticBrowserSetup"
    ${If} $0 == 1
      InitPluginsDir
      File /oname=$PLUGINSDIR\DownloaderrBrowserSetup.exe "${BUILD_RESOURCES_DIR}\browser-setup-helper.exe"
      !insertmacro AwesomeShellExecResult "runas" "$PLUGINSDIR\DownloaderrBrowserSetup.exe" '/remove /owner=$\"$INSTDIR$\"' $0 $1
      ${If} $1 != 0
      ${OrIf} $0 != 0
        ${IfNot} ${Silent}
          MessageBox MB_OK "Automatic browser registration could not be removed. Approve the Windows permission prompt when uninstalling to clean it up."
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend
