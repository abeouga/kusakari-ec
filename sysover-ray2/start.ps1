param()

$ErrorActionPreference = 'Stop'
$setup = Join-Path $PSScriptRoot 'setup.ps1'
$runtimeRoot = Join-Path $env:LOCALAPPDATA 'Kusakari\tools\dotnet-desktop-10'
$executable = Join-Path $PSScriptRoot 'app\KusakariEcSysOverRay.exe'

if (-not ('KusakariEcSysOverRayWindowActivation' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class KusakariEcSysOverRayWindowActivation
{
    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc callback, IntPtr lParam);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hWnd, StringBuilder className, int count);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetWindowText(IntPtr hWnd, StringBuilder title, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")] private static extern int GetWindowLong(IntPtr hWnd, int index);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr hWnd, int command);
    [DllImport("user32.dll")] private static extern bool BringWindowToTop(IntPtr hWnd);
    [DllImport("user32.dll", SetLastError = true)] private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int width, int height, uint flags);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

    public static bool IsTopMost(IntPtr hWnd)
    {
        return (GetWindowLong(hWnd, -20) & 0x8) != 0;
    }

    public static uint GetForegroundProcessId()
    {
        uint processId;
        GetWindowThreadProcessId(GetForegroundWindow(), out processId);
        return processId;
    }

    public static IntPtr FindMainWindow(uint targetProcessId)
    {
        IntPtr found = IntPtr.Zero;
        EnumWindowsProc callback = (hWnd, _) =>
        {
            uint processId;
            GetWindowThreadProcessId(hWnd, out processId);
            if (processId != targetProcessId) return true;

            var className = new StringBuilder(256);
            GetClassName(hWnd, className, className.Capacity);
            if (!className.ToString().StartsWith("HwndWrapper[KusakariEcSysOverRay;", StringComparison.Ordinal)) return true;
            var title = new StringBuilder(256);
            GetWindowText(hWnd, title, title.Capacity);
            if (title.ToString() != "Kusakari 起動オーバーレイ") return true;

            found = hWnd;
            return false;
        };
        EnumWindows(callback, IntPtr.Zero);
        return found;
    }

    public static void Activate(IntPtr hWnd)
    {
        const uint SWP_NOSIZE = 0x0001;
        const uint SWP_NOMOVE = 0x0002;
        const uint SWP_SHOWWINDOW = 0x0040;
        ShowWindowAsync(hWnd, 9);
        SetWindowPos(hWnd, new IntPtr(-1), 0, 0, 0, 0, SWP_NOSIZE | SWP_NOMOVE | SWP_SHOWWINDOW);
        BringWindowToTop(hWnd);
        SetForegroundWindow(hWnd);
    }
}
'@
}

$activationShell = New-Object -ComObject WScript.Shell
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes

try {
  $targetExecutable = [IO.Path]::GetFullPath($executable)
  $existingProcesses = @(Get-CimInstance Win32_Process -Filter "Name='KusakariEcSysOverRay.exe'" |
    Where-Object {
      if ([string]::IsNullOrWhiteSpace($_.ExecutablePath)) { return $false }
      try { return [IO.Path]::GetFullPath($_.ExecutablePath) -ieq $targetExecutable } catch { return $false }
    } | Sort-Object -Property CreationDate -Descending)

  foreach ($candidate in $existingProcesses) {
    $current = Get-CimInstance Win32_Process -Filter "ProcessId=$($candidate.ProcessId)" -ErrorAction SilentlyContinue
    if ($null -eq $current) { continue }
    if ($current.ExecutablePath -ine $targetExecutable -or $current.CreationDate -ne $candidate.CreationDate) { continue }
    $oldProcess = Get-Process -Id $candidate.ProcessId -ErrorAction Stop
    Stop-Process -Id $candidate.ProcessId -Force -ErrorAction Stop
    if (-not $oldProcess.WaitForExit(5000)) { throw '既存のKusakariEcSysOverRayを終了できませんでした。' }
    Write-Host "旧オーバーレイを終了しました (PID $($candidate.ProcessId))。"
  }

  & $setup
  if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw 'KusakariEcSysOverRayのセットアップに失敗しました。' }
  if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
    throw "KusakariEcSysOverRay.exeが見つかりません: $executable"
  }

  $systemDotnet = Get-Command dotnet.exe -ErrorAction SilentlyContinue | Select-Object -First 1
  $systemHasDesktopRuntime = $false
  if ($null -ne $systemDotnet) {
    $runtimes = & $systemDotnet.Source --list-runtimes 2>$null
    $systemHasDesktopRuntime = @($runtimes | Where-Object { $_ -match '^Microsoft\.NETCore\.App 10\.' }).Count -gt 0 -and
      @($runtimes | Where-Object { $_ -match '^Microsoft\.WindowsDesktop\.App 10\.' }).Count -gt 0
  }
  if (-not $systemHasDesktopRuntime) {
    $env:DOTNET_ROOT = $runtimeRoot
    $env:DOTNET_ROOT_X64 = $runtimeRoot
    $env:Path = "$runtimeRoot;$env:Path"
  }

  $process = Start-Process -FilePath $executable -WorkingDirectory (Join-Path $PSScriptRoot 'app') -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(30)
  do {
    $process.Refresh()
    if ($process.HasExited) { throw "KusakariEcSysOverRayが起動後に終了しました (exit $($process.ExitCode))。" }
    $window = [KusakariEcSysOverRayWindowActivation]::FindMainWindow([uint32]$process.Id)
    if ($window -ne [IntPtr]::Zero) {
      [KusakariEcSysOverRayWindowActivation]::Activate($window)
      [void]$activationShell.AppActivate('Kusakari 起動オーバーレイ')
      Start-Sleep -Milliseconds 250
      if ([KusakariEcSysOverRayWindowActivation]::IsWindowVisible($window) -and
          -not [KusakariEcSysOverRayWindowActivation]::IsIconic($window) -and
          [KusakariEcSysOverRayWindowActivation]::IsTopMost($window)) {
        $ui = [System.Windows.Automation.AutomationElement]::FromHandle($window)
        $controlsReady = $true
        foreach ($id in @('StartButton','StopButton','RestartButton')) {
          $condition = [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $id)
          if ($null -eq $ui.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condition)) { $controlsReady = $false }
        }
        if ($controlsReady) {
          Write-Host "KusakariEcSysOverRayの可視画面・最前面属性・操作部品を確認しました (PID $($process.Id))。"
          exit 0
        }
      }
    }
    Start-Sleep -Milliseconds 250
  } while ([DateTime]::UtcNow -lt $deadline)
  throw "KusakariEcSysOverRayは起動しましたが、30秒以内に可視画面・最前面属性・操作部品を確認できませんでした (PID $($process.Id))。"
} catch {
  Write-Error $_ -ErrorAction Continue
  exit 1
}
