; -------------------------------------------------------------
; TuBlox Installer Script
; -------------------------------------------------------------

#define TuBloxVersion "0.5.2"

[Setup]
AppName=TuBlox
AppVersion={#TuBloxVersion}
AppPublisher=TuBlox Corporation
AppPublisherURL=https://tublox.vercel.app
AppSupportURL=https://tublox.vercel.app
AppUpdatesURL=https://tublox.vercel.app
DefaultDirName={localappdata}\TuBlox
DefaultGroupName=TuBlox
OutputBaseFilename=TuBloxSetup
Compression=lzma
SolidCompression=yes
PrivilegesRequired=lowest
DirExistsWarning=no
SetupIconFile=icon.ico
VersionInfoVersion={#TuBloxVersion}
VersionInfoCompany=TuBlox Corporation
VersionInfoDescription=TuBlox Game Installer
VersionInfoProductName=TuBlox
VersionInfoProductVersion={#TuBloxVersion}
VersionInfoCopyright=Copyright 2026 TuBlox Corporation

[Registry]
Root: HKCU; Subkey: "Software\Classes\tublox"; ValueType: string; ValueName: ""; ValueData: "URL:TuBlox Protocol"
Root: HKCU; Subkey: "Software\Classes\tublox"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""
Root: HKCU; Subkey: "Software\Classes\tublox\shell\open\command"; ValueType: string; ValueName: ""; ValueData: """{app}\TuClient.exe"" ""%1"""

[Icons]
Name: "{userdesktop}\TuBlox"; Filename: "{app}\TuClient.exe"; IconFilename: "{app}\icon.ico"
Name: "{group}\TuBlox"; Filename: "{app}\TuClient.exe"; IconFilename: "{app}\icon.ico"

[Code]
var
  DownloadPage: TDownloadWizardPage;

procedure InitializeWizard();
begin
  DownloadPage := CreateDownloadPage(
    'Installing TuBlox',
    'Please wait while TuBlox is being downloaded and installed...', nil);
end;

procedure CleanAppDirectory();
var
  AppDir: string;
begin
  AppDir := ExpandConstant('{app}');
  if DirExists(AppDir) then
    DelTree(AppDir, True, True, True);
  ForceDirectories(AppDir);
end;

function ExtractZip(ZipPath: string; DestDir: string): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;

  if not FileExists(ZipPath) then
  begin
    MsgBox('ZIP file not found: ' + ZipPath, mbError, MB_OK);
    Exit;
  end;

  ForceDirectories(DestDir);

  // tar встроен в Windows 10+ - не триггерит антивирус
  if Exec(ExpandConstant('{sys}\cmd.exe'),
    '/c tar -xf "' + ZipPath + '" -C "' + DestDir + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
    begin
      Result := True;
      Exit;
    end;
  end;

  // Fallback PowerShell
  if Exec('powershell.exe',
    '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath \"' + ZipPath + '\" -DestinationPath \"' + DestDir + '\" -Force"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    if ResultCode = 0 then
      Result := True
    else
      MsgBox('Extraction failed: ' + IntToStr(ResultCode), mbError, MB_OK);
  end;
end;

procedure CreateShortcuts();
var
  ResultCode: Integer;
  AppDir: string;
  DesktopPath: string;
  Lines: TArrayOfString;
  ScriptFile: string;
begin
  AppDir      := ExpandConstant('{app}');
  DesktopPath := ExpandConstant('{userdesktop}');
  ScriptFile  := ExpandConstant('{tmp}\sc.ps1');

  SetArrayLength(Lines, 5);
  Lines[0] := '$ws = New-Object -ComObject WScript.Shell';
  Lines[1] := '$s = $ws.CreateShortcut("' + DesktopPath + '\TuBlox.lnk")';
  Lines[2] := '$s.TargetPath = "' + AppDir + '\TuClient.exe"';
  Lines[3] := '$s.IconLocation = "' + AppDir + '\icon.ico"';
  Lines[4] := '$s.Save()';

  SaveStringsToFile(ScriptFile, Lines, False);

  Exec('powershell.exe',
    '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + ScriptFile + '"',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ClientZip: string;
  AppDir: string;
begin
  if CurStep = ssInstall then
  begin
    AppDir    := ExpandConstant('{app}');
    ClientZip := ExpandConstant('{tmp}\TuClient.zip');

    CleanAppDirectory();

    DownloadPage.Clear;
    DownloadPage.Add(
      'https://tublox.vercel.app/download/TuClient.zip',
      'TuClient.zip', '');

    DownloadPage.Show;
    try
      DownloadPage.Download;
    except
      MsgBox('Download failed! Check your internet connection.', mbError, MB_OK);
      DownloadPage.Hide;
      Exit;
    end;
    DownloadPage.Hide;

    if not ExtractZip(ClientZip, AppDir) then
      Exit;

    CreateShortcuts();

    RegWriteStringValue(HKCU,
      'Software\Classes\tublox', '', 'URL:TuBlox Protocol');
    RegWriteStringValue(HKCU,
      'Software\Classes\tublox', 'URL Protocol', '');
    RegWriteStringValue(HKCU,
      'Software\Classes\tublox\shell\open\command', '',
      '"' + AppDir + '\TuClient.exe" "%1"');
  end;
end;