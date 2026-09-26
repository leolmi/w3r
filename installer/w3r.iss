; Inno Setup script: per-user install (no admin rights), Start menu shortcut, .md association
#define AppName "w3r"
#ifndef AppVersion
  #define AppVersion "1.0.0"
#endif

[Setup]
AppId={{6F0B7C2E-3D41-4B8A-9E57-8C1F2A6D4B90}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher={#AppName}
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ChangesAssociations=yes
OutputDir=..\dist
OutputBaseFilename=w3r-setup-{#AppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={app}\w3r.exe
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "it"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "assoc"; Description: "Apri i file .md con {#AppName}"; GroupDescription: "Associazioni:"
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\dist\w3r\w3r-win_x64.exe"; DestDir: "{app}"; DestName: "w3r.exe"; Flags: ignoreversion

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\w3r.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\w3r.exe"; Tasks: desktopicon

[Registry]
; ProgId used by the associated extensions
Root: HKA; Subkey: "Software\Classes\w3r.markdown"; ValueType: string; ValueName: ""; ValueData: "Documento Markdown"; Flags: uninsdeletekey; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\w3r.markdown\DefaultIcon"; ValueType: string; ValueName: ""; ValueData: "{app}\w3r.exe,0"; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\w3r.markdown\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\w3r.exe"" ""%1"""; Tasks: assoc
; Extensions: w3r becomes the default when no other app has been chosen, and always appears in "Open with"
Root: HKA; Subkey: "Software\Classes\.md"; ValueType: string; ValueName: ""; ValueData: "w3r.markdown"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.md\OpenWithProgids"; ValueType: string; ValueName: "w3r.markdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.markdown"; ValueType: string; ValueName: ""; ValueData: "w3r.markdown"; Flags: uninsdeletevalue; Tasks: assoc
Root: HKA; Subkey: "Software\Classes\.markdown\OpenWithProgids"; ValueType: string; ValueName: "w3r.markdown"; ValueData: ""; Flags: uninsdeletevalue; Tasks: assoc
; "Open with" list entry
Root: HKA; Subkey: "Software\Classes\Applications\w3r.exe\SupportedTypes"; ValueType: string; ValueName: ".md"; ValueData: ""; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Classes\Applications\w3r.exe\SupportedTypes"; ValueType: string; ValueName: ".markdown"; ValueData: ""
Root: HKA; Subkey: "Software\Classes\Applications\w3r.exe\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\w3r.exe"" ""%1"""

[Run]
Filename: "{app}\w3r.exe"; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
