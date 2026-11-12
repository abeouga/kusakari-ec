[CmdletBinding()]
param(
    # 対象を表示するだけで、何も変更しない。
    [switch]$DryRun,
    # 消す前のバックアップを取らない。
    [switch]$NoBackup,
    # 確認の文字を引数で渡す（検証用）。指定しないときは画面で入力を求める。
    [ValidatePattern('^[^"\r\n]*$')]
    [string]$ConfirmText,
    # 管理者として起動し直したときに、起動した人のユーザー名を渡す（スクリプト自身が使う）。
    [ValidatePattern('^[^"\r\n]*$')]
    [string]$RequestedBy
)

$ErrorActionPreference = 'Stop'

function Test-Administrator {
    $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$currentUser = [Security.Principal.WindowsIdentity]::GetCurrent().Name

# DB の初期化は、Windows の管理者として実行する。管理者でないときは、確認を出して起動し直す。
if (-not (Test-Administrator)) {
    Write-Host 'DB の初期化は、Windows の管理者として実行します。'
    Write-Host 'Windows の確認（ユーザー アカウント制御）が表示されます。別のウィンドウで続きを行います。'
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath),
        '-RequestedBy', ('"{0}"' -f $currentUser))
    if ($DryRun) { $arguments += '-DryRun' }
    if ($NoBackup) { $arguments += '-NoBackup' }
    if ($PSBoundParameters.ContainsKey('ConfirmText')) { $arguments += @('-ConfirmText', ('"{0}"' -f $ConfirmText)) }
    try {
        $elevated = Start-Process -FilePath (Join-Path $PSHOME 'powershell.exe') -Verb RunAs -ArgumentList $arguments -Wait -PassThru
    } catch {
        Write-Host '管理者としての起動が取り消されたか、失敗しました。DB は変更していません。'
        exit 1
    }
    exit $elevated.ExitCode
}

$exitCode = 1
if ($RequestedBy -and $RequestedBy -ne $currentUser) {
    # 別のユーザーの管理者として起動すると、専用 MySQL の記録の場所が変わり、対象を取り違える。
    Write-Host "起動した人 ($RequestedBy) と違うユーザー ($currentUser) の管理者権限では実行できません。DB は変更していません。"
} else {
    $coreArguments = @{}
    if ($DryRun) { $coreArguments.DryRun = $true }
    if ($NoBackup) { $coreArguments.NoBackup = $true }
    if ($PSBoundParameters.ContainsKey('ConfirmText')) { $coreArguments.ConfirmText = $ConfirmText }
    & (Join-Path $PSScriptRoot 'reset-database-core.ps1') @coreArguments
    $exitCode = $LASTEXITCODE
}

# 管理者として起動し直したウィンドウは、終わるとすぐ閉じる。結果を読めるように待つ。
if ($RequestedBy -and $env:KUSAKARI_EC_NO_PAUSE -ne '1') {
    Write-Host ''
    $null = Read-Host '結果を確認したら Enter キーを押してください（このウィンドウを閉じます）'
}
exit $exitCode
