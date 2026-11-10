# Headless TUI acceptance harness (console-buffer driver).
#
# Starts the REAL compiled OSSPilot in its own hidden console, attaches to
# that console, injects keystrokes straight into the console input buffer and
# reads the rendered screen buffer back out.
#
# This touches no windows, no focus and no foreground app — it cannot leak
# keystrokes into anything the developer is using.
#
# Usage:
#   powershell -File scripts\_tui_console.ps1 -Name greeting -Steps "3000,hello{ENTER}" -Seconds 10
#   Steps = "delayMs,text" pairs separated by ';' inside a single argument.
#   Text tokens: {ENTER} {ESC} {TAB} {UP} {DOWN} {CTRLC} otherwise literal chars.

param(
  [Parameter(Mandatory = $true)][string]$Name,
  [string]$Steps = "",
  [int]$Seconds = 10,
  [string]$Exe = "",
  [string]$ExtraArgs = "",
  [int]$Cols = 120,
  [int]$Rows = 34
)

$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
if (-not $Exe) { $Exe = Join-Path $repo "dist\osspilot.exe" }
$dir = Join-Path $env:LOCALAPPDATA "Temp\opencode\tui"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$screenFile = Join-Path $dir "$Name.screen.txt"
if (Test-Path $screenFile) { Remove-Item $screenFile -Force }

$cs = @"
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;

public class ConsoleSession : IDisposable
{
    [StructLayout(LayoutKind.Sequential)]
    public struct COORD { public short X; public short Y; }

    [StructLayout(LayoutKind.Sequential)]
    public struct SMALL_RECT { public short Left; public short Top; public short Right; public short Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct CONSOLE_SCREEN_BUFFER_INFO
    {
        public COORD dwSize;
        public COORD dwCursorPosition;
        public ushort wAttributes;
        public SMALL_RECT srWindow;
        public COORD dwMaximumWindowSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct KEY_EVENT_RECORD
    {
        public int bKeyDown;
        public ushort wRepeatCount;
        public ushort wVirtualKeyCode;
        public ushort wVirtualScanCode;
        public ushort UnicodeChar;
        public int dwControlKeyState;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct INPUT_RECORD
    {
        public ushort EventType;
        public KEY_EVENT_RECORD KeyEvent;
    }

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct STARTUPINFO
    {
        public int cb;
        public string lpReserved;
        public string lpDesktop;
        public string lpTitle;
        public int dwX; public int dwY; public int dwXSize; public int dwYSize;
        public int dwXCountChars; public int dwYCountChars; public int dwFillAttribute;
        public int dwFlags;
        public short wShowWindow; public short cbReserved2;
        public IntPtr lpReserved2;
        public IntPtr hStdInput; public IntPtr hStdOutput; public IntPtr hStdError;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct PROCESS_INFORMATION
    {
        public IntPtr hProcess; public IntPtr hThread;
        public int dwProcessId; public int dwThreadId;
    }

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool CreateProcessW(string lpApplicationName, StringBuilder lpCommandLine,
        IntPtr lpProcessAttributes, IntPtr lpThreadAttributes, bool bInheritHandles,
        uint dwCreationFlags, IntPtr lpEnvironment, string lpCurrentDirectory,
        ref STARTUPINFO lpStartupInfo, out PROCESS_INFORMATION lpProcessInformation);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool AttachConsole(uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool FreeConsole();

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern IntPtr CreateFileW(string lpFileName, uint dwDesiredAccess, uint dwShareMode,
        IntPtr lpSecurityAttributes, uint dwCreationDisposition, uint dwFlagsAndAttributes, IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool GetConsoleScreenBufferInfo(IntPtr hConsoleOutput, out CONSOLE_SCREEN_BUFFER_INFO lpConsoleScreenBufferInfo);

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    static extern bool ReadConsoleOutputCharacterW(IntPtr hConsoleOutput, StringBuilder lpCharacter,
        int nLength, COORD dwReadCoord, out int lpNumberOfCharsRead);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool WriteConsoleInputW(IntPtr hConsoleInput, INPUT_RECORD[] lpBuffer,
        uint nLength, out uint lpNumberOfEventsWritten);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool TerminateProcess(IntPtr hProcess, uint uExitCode);

    [DllImport("kernel32.dll")]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("user32.dll")]
    static extern short VkKeyScanW(char ch);

    const uint CREATE_NO_WINDOW = 0x08000000;
    const uint GENERIC_READ = 0x80000000;
    const uint GENERIC_WRITE = 0x40000000;
    const uint FILE_SHARE_READ = 0x00000001;
    const uint FILE_SHARE_WRITE = 0x00000002;
    const uint OPEN_EXISTING = 3;
    const ushort KEY_EVENT = 0x0001;
    const ushort MAPVK_VK_TO_VSC = 0;

    IntPtr _hProcess;
    IntPtr _conIn = new IntPtr(-1);
    IntPtr _conOut = new IntPtr(-1);
    Process _process;
    uint _pid;

    public static ConsoleSession Start(string exe, string extraArgs, string cwd)
    {
        var s = new ConsoleSession();
        var si = new STARTUPINFO();
        si.cb = Marshal.SizeOf(typeof(STARTUPINFO));
        var pi = new PROCESS_INFORMATION();
        var cmd = new StringBuilder("\"" + exe + "\"" + (extraArgs.Length > 0 ? " " + extraArgs : ""));
        if (!CreateProcessW(null, cmd, IntPtr.Zero, IntPtr.Zero, false, CREATE_NO_WINDOW,
                IntPtr.Zero, cwd, ref si, out pi))
            throw new Exception("CreateProcess failed: " + Marshal.GetLastWin32Error());

        CloseHandle(pi.hThread);
        s._hProcess = pi.hProcess;
        s._process = Process.GetProcessById(pi.dwProcessId);
        s._pid = (uint)pi.dwProcessId;

        // Attach to the child's hidden console (retry: console spins up async).
        FreeConsole();
        bool attached = false;
        for (int i = 0; i < 50 && !attached; i++)
        {
            attached = AttachConsole(s._pid);
            if (!attached) System.Threading.Thread.Sleep(100);
        }
        if (!attached) throw new Exception("AttachConsole failed: " + Marshal.GetLastWin32Error());

        s._conIn = CreateFileW("CONIN$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        s._conOut = CreateFileW("CONOUT$", GENERIC_READ | GENERIC_WRITE, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
        if (s._conIn == new IntPtr(-1) || s._conOut == new IntPtr(-1))
            throw new Exception("CreateFile CONIN$/CONOUT$ failed: " + Marshal.GetLastWin32Error());
        return s;
    }

    static INPUT_RECORD Key(bool down, ushort vk, ushort ch)
    {
        var r = new INPUT_RECORD();
        r.EventType = KEY_EVENT;
        r.KeyEvent.bKeyDown = down ? 1 : 0;
        r.KeyEvent.wRepeatCount = 1;
        r.KeyEvent.wVirtualKeyCode = vk;
        r.KeyEvent.wVirtualScanCode = (ushort)MapVirtualKey(vk, MAPVK_VK_TO_VSC);
        r.KeyEvent.UnicodeChar = ch;
        r.KeyEvent.dwControlKeyState = 0;
        return r;
    }

    [DllImport("user32.dll")]
    static extern uint MapVirtualKeyW(uint uCode, uint uMapType);
    static uint MapVirtualKey(ushort vk, uint type) { return MapVirtualKeyW(vk, type); }

    void WriteRecords(INPUT_RECORD[] records)
    {
        uint written;
        if (!WriteConsoleInputW(_conIn, records, (uint)records.Length, out written))
            throw new Exception("WriteConsoleInput failed: " + Marshal.GetLastWin32Error());
    }

    public void SendText(string text)
    {
        if (String.IsNullOrEmpty(text)) return;
        var records = new List<INPUT_RECORD>();
        foreach (char c in text)
        {
            ushort vk;
            if (c == '\r') vk = 0x0D;
            else if (c == '\n') { continue; }        // Enter already sent as CR
            else if (c == '\x1b') vk = 0x1B;
            else if (c == '\t') vk = 0x09;
            else
            {
                short scan = VkKeyScanW(c);
                vk = scan == -1 ? (ushort)0 : (ushort)(scan & 0xFF);
            }
            ushort ch = (ushort)c;
            records.Add(Key(true, vk, ch));
            records.Add(Key(false, vk, ch));
        }
        WriteRecords(records.ToArray());
    }

    public void SendKey(ushort vk, ushort ch)
    {
        WriteRecords(new INPUT_RECORD[] { Key(true, vk, ch), Key(false, vk, ch) });
    }

    public void SendCtrlC()
    {
        const int LEFT_CTRL_PRESSED = 0x0008;
        INPUT_RECORD down = Key(true, 0x43, 0x03);
        down.KeyEvent.dwControlKeyState = LEFT_CTRL_PRESSED;
        INPUT_RECORD up = Key(false, 0x43, 0x03);
        up.KeyEvent.dwControlKeyState = LEFT_CTRL_PRESSED;
        WriteRecords(new INPUT_RECORD[] { down, up });
    }

    public string[] ReadScreen()
    {
        CONSOLE_SCREEN_BUFFER_INFO info;
        if (!GetConsoleScreenBufferInfo(_conOut, out info))
            throw new Exception("GetConsoleScreenBufferInfo failed: " + Marshal.GetLastWin32Error());
        int width = info.dwSize.X;
        int top = info.srWindow.Top;
        int bottom = info.srWindow.Bottom;
        var lines = new List<string>();
        for (int y = top; y <= bottom && y < info.dwSize.Y; y++)
        {
            var sb = new StringBuilder(width);
            int read;
            COORD at = new COORD { X = 0, Y = (short)y };
            if (ReadConsoleOutputCharacterW(_conOut, sb, width, at, out read))
                lines.Add(sb.ToString(0, Math.Max(0, read)).TrimEnd());
            else
                lines.Add("");
        }
        return lines.ToArray();
    }

    public bool HasExited()
    {
        return _process == null || _process.HasExited;
    }

    public void Stop()
    {
        try { if (_process != null && !_process.HasExited) TerminateProcess(_hProcess, 1); } catch { }
        try { if (_process != null) _process.WaitForExit(3000); } catch { }
        if (_conIn != new IntPtr(-1)) CloseHandle(_conIn);
        if (_conOut != new IntPtr(-1)) CloseHandle(_conOut);
        FreeConsole();
    }

    public void Dispose() { Stop(); }
}
"@

Add-Type -TypeDefinition $cs -Language CSharp -ErrorAction Stop

Write-Output "=== SCENARIO: $Name ==="
$session = [ConsoleSession]::Start($Exe, $ExtraArgs, $repo)

# Give the TUI time to boot before any keystrokes. Each step's delay is the
# timestamp (ms since launch) at which its keys are sent.
$sw = [System.Diagnostics.Stopwatch]::StartNew()
if ($Steps) {
  foreach ($step in ($Steps -split ';')) {
    if (-not $step) { continue }
    $comma = $step.IndexOf(',')
    $at = [int]$step.Substring(0, $comma)
    $keys = $step.Substring($comma + 1)
    $wait = $at - $sw.ElapsedMilliseconds
    if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
    # tokenise {ENTER} {ESC} {TAB} {CTRLC} etc.
    $pattern = '\{(ENTER|ESC|TAB|CTRLC|UP|DOWN)\}'
    $parts = [regex]::Split($keys, $pattern)
    $idx = 0
    while ($idx -lt $parts.Length) {
      $part = $parts[$idx]
      if ($part -match '^(ENTER|ESC|TAB|CTRLC|UP|DOWN)$') {
        switch ($part) {
          "ENTER" { $session.SendKey(13, 13) }
          "ESC"   { $session.SendKey(27, 27) }
          "TAB"   { $session.SendKey(9, 9) }
          "CTRLC" { $session.SendCtrlC() }
          "UP"    { $session.SendKey(38, 0) }
          "DOWN"  { $session.SendKey(40, 0) }
        }
      } elseif ($part.Length -gt 0) {
        $session.SendText($part)
      }
      $idx++
    }
  }
}

# Let async handlers finish before reading the screen.
Start-Sleep -Milliseconds ([Math]::Max(0, $Seconds * 1000))

$exited = $false
try { $exited = $session.HasExited() } catch { $exited = $false }
Write-Output "child exited after input: $exited"

$screen = @()
try { $screen = $session.ReadScreen() } catch { $screen = @("(read failed: $($_.Exception.Message))") }
$session.Stop()

$screen | Out-File -FilePath $screenFile -Encoding utf8
Write-Output "--- SCREEN: $Name ---"
$n = 1
foreach ($line in $screen) {
  Write-Output ("{0,2}| {1}" -f $n, $line)
  $n++
}
