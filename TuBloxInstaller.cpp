#include <windows.h>
#include <wininet.h>
#include <shlobj.h>
#include <commctrl.h>
#include <gdiplus.h>
#include <string>
#include <fstream>
#include <cmath>

#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "uuid.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "gdiplus.lib")

using namespace Gdiplus;

// ============================================
// НАСТРОЙКИ
// ============================================
const char* DOWNLOAD_URL = "https://tublox.onrender.com/download/TuClient.zip";
const char* INSTALL_FOLDER = "TuBlox";
const char* CLIENT_EXE = "TuClient.exe";
const char* ZIP_FOLDER_INSIDE = "TuClient";

// ============================================
// Цвета (как на сайте)
// ============================================
#define COLOR_BG          RGB(0, 0, 0)
#define COLOR_CARD        RGB(10, 10, 10)
#define COLOR_BORDER      RGB(26, 26, 26)
#define COLOR_WHITE       RGB(255, 255, 255)
#define COLOR_GRAY        RGB(119, 119, 119)
#define COLOR_GRAY_DARK   RGB(68, 68, 68)
#define COLOR_GREEN       RGB(34, 197, 94)
#define COLOR_RED         RGB(255, 51, 51)

// ============================================
// Глобальные переменные
// ============================================
HWND hMainWindow = NULL;
HWND hInstallBtn = NULL;
HBRUSH hBgBrush = NULL;
HBRUSH hCardBrush = NULL;
HFONT hFontTitle = NULL;
HFONT hFontNormal = NULL;
HFONT hFontSmall = NULL;

int currentProgress = 0;
char statusText[256] = "Click Install to begin";
bool isInstalling = false;
bool installSuccess = false;
bool installError = false;

float spinnerAngle = 0.0f;
UINT_PTR animTimer = 0;

ULONG_PTR gdiplusToken;

// ============================================
// Утилиты
// ============================================
void UpdateProgress(int percent, const char* status) {
    currentProgress = percent;
    strcpy(statusText, status);
    InvalidateRect(hMainWindow, NULL, FALSE);
    
    MSG msg;
    while (PeekMessage(&msg, NULL, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
}

std::string GetInstallPath() {
    char localAppData[MAX_PATH];
    if (SHGetFolderPathA(NULL, CSIDL_LOCAL_APPDATA, NULL, 0, localAppData) == S_OK) {
        return std::string(localAppData) + "\\" + INSTALL_FOLDER;
    }
    return "C:\\TuBlox";
}

std::string GetTempFilePath() {
    char tempPath[MAX_PATH];
    GetTempPathA(MAX_PATH, tempPath);
    return std::string(tempPath) + "TuClient.zip";
}

// ============================================
// Скачивание
// ============================================
bool DownloadFile(const std::string& url, const std::string& savePath) {
    UpdateProgress(5, "Connecting...");
    
    HINTERNET hInternet = InternetOpenA("TuBlox/1.0", INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (!hInternet) {
        UpdateProgress(0, "Connection failed");
        return false;
    }
    
    DWORD timeout = 30000;
    InternetSetOptionA(hInternet, INTERNET_OPTION_CONNECT_TIMEOUT, &timeout, sizeof(timeout));
    InternetSetOptionA(hInternet, INTERNET_OPTION_RECEIVE_TIMEOUT, &timeout, sizeof(timeout));
    
    DWORD flags = INTERNET_FLAG_RELOAD | INTERNET_FLAG_NO_CACHE_WRITE | INTERNET_FLAG_SECURE;
    
    HINTERNET hUrl = InternetOpenUrlA(hInternet, url.c_str(), NULL, 0, flags, 0);
    if (!hUrl) {
        UpdateProgress(0, "Cannot connect to server");
        InternetCloseHandle(hInternet);
        return false;
    }
    
    DWORD statusCode = 0;
    DWORD size = sizeof(statusCode);
    HttpQueryInfoA(hUrl, HTTP_QUERY_STATUS_CODE | HTTP_QUERY_FLAG_NUMBER, &statusCode, &size, NULL);
    
    if (statusCode >= 400) {
        char msg[64];
        sprintf(msg, "Server error: %lu", statusCode);
        UpdateProgress(0, msg);
        InternetCloseHandle(hUrl);
        InternetCloseHandle(hInternet);
        return false;
    }
    
    char sizeBuffer[32] = {0};
    DWORD sizeBufferLen = sizeof(sizeBuffer);
    DWORD idx = 0;
    DWORD totalSize = 0;
    
    if (HttpQueryInfoA(hUrl, HTTP_QUERY_CONTENT_LENGTH, sizeBuffer, &sizeBufferLen, &idx)) {
        totalSize = atoi(sizeBuffer);
    }
    
    std::ofstream file(savePath, std::ios::binary);
    if (!file.is_open()) {
        UpdateProgress(0, "Cannot create file");
        InternetCloseHandle(hUrl);
        InternetCloseHandle(hInternet);
        return false;
    }
    
    char buffer[8192];
    DWORD bytesRead;
    DWORD totalRead = 0;
    
    while (InternetReadFile(hUrl, buffer, sizeof(buffer), &bytesRead) && bytesRead > 0) {
        file.write(buffer, bytesRead);
        totalRead += bytesRead;
        
        int percent = 10;
        if (totalSize > 0) {
            percent = 10 + (int)((totalRead * 50) / totalSize);
        }
        
        char status[64];
        if (totalSize > 0) {
            sprintf(status, "Downloading %.1f / %.1f MB", totalRead / 1048576.0f, totalSize / 1048576.0f);
        } else {
            sprintf(status, "Downloading %.1f MB", totalRead / 1048576.0f);
        }
        UpdateProgress(percent, status);
    }
    
    file.close();
    InternetCloseHandle(hUrl);
    InternetCloseHandle(hInternet);
    
    if (totalRead < 1000) {
        UpdateProgress(0, "Download incomplete");
        DeleteFileA(savePath.c_str());
        return false;
    }
    
    return true;
}

// ============================================
// Распаковка
// ============================================
bool ExtractZip(const std::string& zipPath, const std::string& destPath) {
    UpdateProgress(65, "Extracting...");
    
    CreateDirectoryA(destPath.c_str(), NULL);
    
    std::string cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -Command \"";
    cmd += "Expand-Archive -LiteralPath '";
    cmd += zipPath;
    cmd += "' -DestinationPath '";
    cmd += destPath;
    cmd += "' -Force\"";
    
    STARTUPINFOA si = {0};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    
    PROCESS_INFORMATION pi = {0};
    
    if (!CreateProcessA(NULL, (LPSTR)cmd.c_str(), NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
        UpdateProgress(0, "Extraction failed");
        return false;
    }
    
    while (WaitForSingleObject(pi.hProcess, 200) == WAIT_TIMEOUT) {
        UpdateProgress(70 + (currentProgress % 10), "Extracting...");
    }
    
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    
    return exitCode == 0;
}

// ============================================
// Поиск exe
// ============================================
std::string FindClientExe(const std::string& installPath) {
    std::string path1 = installPath + "\\" + ZIP_FOLDER_INSIDE + "\\" + CLIENT_EXE;
    if (GetFileAttributesA(path1.c_str()) != INVALID_FILE_ATTRIBUTES) return path1;
    
    std::string path2 = installPath + "\\" + CLIENT_EXE;
    if (GetFileAttributesA(path2.c_str()) != INVALID_FILE_ATTRIBUTES) return path2;
    
    WIN32_FIND_DATAA fd;
    HANDLE hFind = FindFirstFileA((installPath + "\\*").c_str(), &fd);
    if (hFind != INVALID_HANDLE_VALUE) {
        do {
            if ((fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) &&
                strcmp(fd.cFileName, ".") != 0 && strcmp(fd.cFileName, "..") != 0) {
                std::string subPath = installPath + "\\" + fd.cFileName + "\\" + CLIENT_EXE;
                if (GetFileAttributesA(subPath.c_str()) != INVALID_FILE_ATTRIBUTES) {
                    FindClose(hFind);
                    return subPath;
                }
            }
        } while (FindNextFileA(hFind, &fd));
        FindClose(hFind);
    }
    return "";
}

// ============================================
// Регистрация протокола
// ============================================
bool RegisterProtocol(const std::string& exePath) {
    UpdateProgress(85, "Registering protocol...");
    
    HKEY hKey;
    
    if (RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\Classes\\tublox", 
        0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL) != ERROR_SUCCESS) {
        return false;
    }
    
    const char* desc = "URL:TuBlox Protocol";
    RegSetValueExA(hKey, NULL, 0, REG_SZ, (BYTE*)desc, (DWORD)strlen(desc) + 1);
    RegSetValueExA(hKey, "URL Protocol", 0, REG_SZ, (BYTE*)"", 1);
    RegCloseKey(hKey);
    
    std::string iconPath = "\"" + exePath + "\",0";
    RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\Classes\\tublox\\DefaultIcon",
        0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL);
    RegSetValueExA(hKey, NULL, 0, REG_SZ, (BYTE*)iconPath.c_str(), (DWORD)iconPath.size() + 1);
    RegCloseKey(hKey);
    
    RegCreateKeyExA(HKEY_CURRENT_USER, "Software\\Classes\\tublox\\shell\\open\\command",
        0, NULL, REG_OPTION_NON_VOLATILE, KEY_WRITE, NULL, &hKey, NULL);
    std::string command = "\"" + exePath + "\" \"%1\"";
    RegSetValueExA(hKey, NULL, 0, REG_SZ, (BYTE*)command.c_str(), (DWORD)command.size() + 1);
    RegCloseKey(hKey);
    
    return true;
}

// ============================================
// Ярлык
// ============================================
bool CreateDesktopShortcut(const std::string& exePath) {
    UpdateProgress(93, "Creating shortcut...");
    
    CoInitialize(NULL);
    
    IShellLinkA* pLink = NULL;
    if (SUCCEEDED(CoCreateInstance(CLSID_ShellLink, NULL, CLSCTX_INPROC_SERVER, IID_IShellLinkA, (void**)&pLink))) {
        pLink->SetPath(exePath.c_str());
        pLink->SetDescription("TuBlox Client");
        
        size_t pos = exePath.find_last_of("\\/");
        if (pos != std::string::npos) {
            pLink->SetWorkingDirectory(exePath.substr(0, pos).c_str());
        }
        
        char desktop[MAX_PATH];
        SHGetFolderPathA(NULL, CSIDL_DESKTOPDIRECTORY, NULL, 0, desktop);
        
        IPersistFile* pFile = NULL;
        if (SUCCEEDED(pLink->QueryInterface(IID_IPersistFile, (void**)&pFile))) {
            WCHAR wsz[MAX_PATH];
            MultiByteToWideChar(CP_ACP, 0, (std::string(desktop) + "\\TuBlox.lnk").c_str(), -1, wsz, MAX_PATH);
            pFile->Save(wsz, TRUE);
            pFile->Release();
        }
        pLink->Release();
    }
    
    CoUninitialize();
    return true;
}

// ============================================
// Установка
// ============================================
DWORD WINAPI InstallThread(LPVOID) {
    std::string installPath = GetInstallPath();
    std::string zipPath = GetTempFilePath();
    
    isInstalling = true;
    installSuccess = false;
    installError = false;
    
    if (!DownloadFile(DOWNLOAD_URL, zipPath)) {
        installError = true;
        isInstalling = false;
        InvalidateRect(hMainWindow, NULL, FALSE);
        return 1;
    }
    
    if (!ExtractZip(zipPath, installPath)) {
        DeleteFileA(zipPath.c_str());
        UpdateProgress(0, "Extraction failed");
        installError = true;
        isInstalling = false;
        InvalidateRect(hMainWindow, NULL, FALSE);
        return 1;
    }
    
    DeleteFileA(zipPath.c_str());
    
    std::string clientExe = FindClientExe(installPath);
    if (clientExe.empty()) {
        UpdateProgress(0, "TuClient.exe not found");
        installError = true;
        isInstalling = false;
        InvalidateRect(hMainWindow, NULL, FALSE);
        return 1;
    }
    
    RegisterProtocol(clientExe);
    CreateDesktopShortcut(clientExe);
    
    UpdateProgress(100, "Installation complete!");
    installSuccess = true;
    isInstalling = false;
    InvalidateRect(hMainWindow, NULL, FALSE);
    
    return 0;
}

// ============================================
// Отрисовка
// ============================================
void DrawRoundedRect(Graphics& g, int x, int y, int w, int h, int r, Color fill, Color border) {
    GraphicsPath path;
    path.AddArc(x, y, r * 2, r * 2, 180, 90);
    path.AddArc(x + w - r * 2, y, r * 2, r * 2, 270, 90);
    path.AddArc(x + w - r * 2, y + h - r * 2, r * 2, r * 2, 0, 90);
    path.AddArc(x, y + h - r * 2, r * 2, r * 2, 90, 90);
    path.CloseFigure();
    
    SolidBrush brush(fill);
    g.FillPath(&brush, &path);
    
    Pen pen(border, 1);
    g.DrawPath(&pen, &path);
}

void DrawSpinner(Graphics& g, int cx, int cy, int radius) {
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    
    // Background ring
    Pen bgPen(Color(40, 255, 255, 255), 3);
    g.DrawEllipse(&bgPen, cx - radius, cy - radius, radius * 2, radius * 2);
    
    // Spinning arc
    float startAngle = spinnerAngle;
    float sweepAngle = 240;
    
    Pen arcPen(Color(255, 255, 255, 255), 3);
    arcPen.SetStartCap(LineCapRound);
    arcPen.SetEndCap(LineCapRound);
    
    g.DrawArc(&arcPen, cx - radius, cy - radius, radius * 2, radius * 2, startAngle, sweepAngle);
}

void DrawCheckmark(Graphics& g, int cx, int cy, int size) {
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    
    // Green circle
    SolidBrush circleBrush(Color(255, 34, 197, 94));
    g.FillEllipse(&circleBrush, cx - size, cy - size, size * 2, size * 2);
    
    // White checkmark
    Pen checkPen(Color(255, 255, 255, 255), 3);
    checkPen.SetStartCap(LineCapRound);
    checkPen.SetEndCap(LineCapRound);
    checkPen.SetLineJoin(LineJoinRound);
    
    Point points[3] = {
        Point(cx - size/3, cy),
        Point(cx - size/10, cy + size/3),
        Point(cx + size/3, cy - size/4)
    };
    g.DrawLines(&checkPen, points, 3);
}

void DrawError(Graphics& g, int cx, int cy, int size) {
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    
    // Red circle
    SolidBrush circleBrush(Color(255, 255, 51, 51));
    g.FillEllipse(&circleBrush, cx - size, cy - size, size * 2, size * 2);
    
    // White X
    Pen xPen(Color(255, 255, 255, 255), 3);
    xPen.SetStartCap(LineCapRound);
    xPen.SetEndCap(LineCapRound);
    
    int offset = size / 3;
    g.DrawLine(&xPen, cx - offset, cy - offset, cx + offset, cy + offset);
    g.DrawLine(&xPen, cx + offset, cy - offset, cx - offset, cy + offset);
}

void OnPaint(HWND hwnd) {
    PAINTSTRUCT ps;
    HDC hdc = BeginPaint(hwnd, &ps);
    
    RECT rc;
    GetClientRect(hwnd, &rc);
    int w = rc.right;
    int h = rc.bottom;
    
    // Double buffering
    HDC memDC = CreateCompatibleDC(hdc);
    HBITMAP memBitmap = CreateCompatibleBitmap(hdc, w, h);
    SelectObject(memDC, memBitmap);
    
    Graphics g(memDC);
    g.SetSmoothingMode(SmoothingModeAntiAlias);
    g.SetTextRenderingHint(TextRenderingHintClearTypeGridFit);
    
    // Background
    SolidBrush bgBrush(Color(255, 0, 0, 0));
    g.FillRectangle(&bgBrush, 0, 0, w, h);
    
    // Card
    DrawRoundedRect(g, 20, 20, w - 40, h - 40, 16, Color(255, 10, 10, 10), Color(255, 26, 26, 26));
    
    // Title
    FontFamily fontFamily(L"Segoe UI");
    Font titleFont(&fontFamily, 24, FontStyleBold, UnitPixel);
    Font normalFont(&fontFamily, 14, FontStyleRegular, UnitPixel);
    Font smallFont(&fontFamily, 12, FontStyleRegular, UnitPixel);
    
    SolidBrush whiteBrush(Color(255, 255, 255, 255));
    SolidBrush grayBrush(Color(255, 119, 119, 119));
    
    StringFormat centerFormat;
    centerFormat.SetAlignment(StringAlignmentCenter);
    
    RectF titleRect(0, 40, (float)w, 30);
    g.DrawString(L"TuBlox Installer", -1, &titleFont, titleRect, &centerFormat, &whiteBrush);
    
    // Status/Spinner area
    int centerY = 130;
    
    if (isInstalling) {
        DrawSpinner(g, w/2, centerY, 25);
    } else if (installSuccess) {
        DrawCheckmark(g, w/2, centerY, 25);
    } else if (installError) {
        DrawError(g, w/2, centerY, 25);
    }
    
    // Progress bar (only during installation)
    if (isInstalling || installSuccess) {
        int barX = 50;
        int barY = centerY + 50;
        int barW = w - 100;
        int barH = 6;
        
        // Bar background
        DrawRoundedRect(g, barX, barY, barW, barH, 3, Color(255, 26, 26, 26), Color(255, 26, 26, 26));
        
        // Bar fill
        if (currentProgress > 0) {
            int fillW = (barW * currentProgress) / 100;
            if (fillW > 6) {
                DrawRoundedRect(g, barX, barY, fillW, barH, 3, Color(255, 255, 255, 255), Color(255, 255, 255, 255));
            }
        }
    }
    
    // Status text
    wchar_t wStatus[256];
    MultiByteToWideChar(CP_UTF8, 0, statusText, -1, wStatus, 256);
    
    RectF statusRect(0, (float)(centerY + 70), (float)w, 20);
    g.DrawString(wStatus, -1, &normalFont, statusRect, &centerFormat, &grayBrush);
    
    // Button (only if not installing)
    if (!isInstalling) {
        int btnX = w/2 - 70;
        int btnY = h - 85;
        int btnW = 140;
        int btnH = 42;
        
        Color btnColor = installSuccess ? Color(255, 34, 197, 94) : Color(255, 255, 255, 255);
        Color textColor = installSuccess ? Color(255, 255, 255, 255) : Color(255, 0, 0, 0);
        
        if (installError) {
            btnColor = Color(255, 255, 255, 255);
        }
        
        DrawRoundedRect(g, btnX, btnY, btnW, btnH, 10, btnColor, btnColor);
        
        Font btnFont(&fontFamily, 15, FontStyleBold, UnitPixel);
        SolidBrush btnTextBrush(textColor);
        
        const wchar_t* btnText = L"Install";
        if (installSuccess) btnText = L"Done";
        else if (installError) btnText = L"Retry";
        
        RectF btnRect((float)btnX, (float)btnY + 12, (float)btnW, 20);
        g.DrawString(btnText, -1, &btnFont, btnRect, &centerFormat, &btnTextBrush);
    }
    
    // Copy to screen
    BitBlt(hdc, 0, 0, w, h, memDC, 0, 0, SRCCOPY);
    
    DeleteObject(memBitmap);
    DeleteDC(memDC);
    
    EndPaint(hwnd, &ps);
}

// ============================================
// Window Procedure
// ============================================
LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    switch (msg) {
        case WM_CREATE:
            SetTimer(hwnd, 1, 16, NULL); // 60 FPS animation
            return 0;
            
        case WM_TIMER:
            if (isInstalling) {
                spinnerAngle += 8;
                if (spinnerAngle >= 360) spinnerAngle -= 360;
                InvalidateRect(hwnd, NULL, FALSE);
            }
            return 0;
            
        case WM_PAINT:
            OnPaint(hwnd);
            return 0;
            
        case WM_LBUTTONUP: {
            if (isInstalling) return 0;
            
            int x = LOWORD(lParam);
            int y = HIWORD(lParam);
            
            RECT rc;
            GetClientRect(hwnd, &rc);
            int w = rc.right;
            int h = rc.bottom;
            
            int btnX = w/2 - 70;
            int btnY = h - 85;
            int btnW = 140;
            int btnH = 42;
            
            if (x >= btnX && x <= btnX + btnW && y >= btnY && y <= btnY + btnH) {
                if (installSuccess) {
                    PostQuitMessage(0);
                } else {
                    CreateThread(NULL, 0, InstallThread, NULL, 0, NULL);
                }
            }
            return 0;
        }
        
        case WM_SETCURSOR: {
            POINT pt;
            GetCursorPos(&pt);
            ScreenToClient(hwnd, &pt);
            
            RECT rc;
            GetClientRect(hwnd, &rc);
            int w = rc.right;
            int h = rc.bottom;
            
            int btnX = w/2 - 70;
            int btnY = h - 85;
            int btnW = 140;
            int btnH = 42;
            
            if (!isInstalling && pt.x >= btnX && pt.x <= btnX + btnW && pt.y >= btnY && pt.y <= btnY + btnH) {
                SetCursor(LoadCursor(NULL, IDC_HAND));
                return TRUE;
            }
            break;
        }
        
        case WM_DESTROY:
            KillTimer(hwnd, 1);
            PostQuitMessage(0);
            return 0;
    }
    
    return DefWindowProcA(hwnd, msg, wParam, lParam);
}

// ============================================
// WinMain
// ============================================
int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE, LPSTR, int nCmdShow) {
    // GDI+ init
    GdiplusStartupInput gdiplusStartupInput;
    GdiplusStartup(&gdiplusToken, &gdiplusStartupInput, NULL);
    
    INITCOMMONCONTROLSEX icc = { sizeof(icc), ICC_PROGRESS_CLASS };
    InitCommonControlsEx(&icc);
    
    WNDCLASSEXA wc = {0};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)GetStockObject(BLACK_BRUSH);
    wc.lpszClassName = "TuBloxInstaller";
    wc.hIcon = LoadIcon(NULL, IDI_APPLICATION);
    RegisterClassExA(&wc);
    
    int winW = 400;
    int winH = 320;
    
    hMainWindow = CreateWindowExA(
        WS_EX_APPWINDOW,
        "TuBloxInstaller",
        "TuBlox",
        WS_POPUP | WS_VISIBLE,
        (GetSystemMetrics(SM_CXSCREEN) - winW) / 2,
        (GetSystemMetrics(SM_CYSCREEN) - winH) / 2,
        winW, winH,
        NULL, NULL, hInstance, NULL
    );
    
    ShowWindow(hMainWindow, nCmdShow);
    
    MSG msg;
    while (GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }
    
    GdiplusShutdown(gdiplusToken);
    
    return 0;
}