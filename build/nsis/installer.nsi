; ===============================================
; 极简笔记 - 自定义扁平风格安装脚本
; 基于 Ultra-Modern UI 设计风格
; ===============================================

; ========== 界面颜色配置 ==========
!define MUI_ICON "${BUILD_RESOURCES_DIR}\icon.ico"
!define MUI_UNICON "${BUILD_RESOURCES_DIR}\icon.ico"

; 扁平化配色 - 主色调
!define UMUI_BG_COLOR "FFFFFF"
!define UMUI_HEADER_BG "FFFFFF"
!define UMUI_TEXT_COLOR "333333"
!define UMUI_ACCENT_COLOR "007AFF"    ; 蓝色主色
!define UMUI_BUTTON_HOVER "0056B3"
!define UMUI_PROGRESS_BAR "007AFF"
!define UMUI_PROGRESS_BG "E5E5E5"

; ========== 页面配置 ==========
!define UMUI_SKIN "win"

; ========== 安装页面 ==========
!macro CUSTOM_INSTALL
  ; 静默安装支持
  ; ${If} ${Silent}
  ;   SetAutoClose true
  ; ${EndIf}
  
  ; 最小化安装到指定目录
  SetOutPath $INSTDIR
  
  ; 创建开始菜单快捷方式
  CreateDirectory "$SMPROGRAMS\${PRODUCT_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE_NAME}"
  CreateShortCut "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk" "$INSTDIR\uninstall.exe"
  
  ; 创建桌面快捷方式
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE_NAME}"
!macroend

; ========== 卸载页面 ==========
!macro CUSTOM_UNINSTALL
  ; 删除快捷方式
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\${PRODUCT_NAME}\卸载 ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\${PRODUCT_NAME}"
  Delete "$DESKTOP\${PRODUCT_NAME}.lnk"
!macroend

; ========== 预定义宏 ==========
!macro preInit
  ; 初始化时执行
!macroend

!macro customInit
  ; 自定义初始化
!macroend

!macro customHeader
  ; 自定义头部
!macroend

!macro addLicenseFiles
  ; 添加许可文件
!macroend

!macro customUnInstallSection
  ; 自定义卸载部分
!macroend