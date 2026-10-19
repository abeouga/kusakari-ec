param([Parameter(Mandatory=$true)][string]$CanvasRoot)
$ErrorActionPreference = 'Stop'
$sourceEc = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceCanvas = [IO.Path]::GetFullPath($CanvasRoot)
if ((Get-Content -Raw -LiteralPath (Join-Path $sourceCanvas 'package.json') | ConvertFrom-Json).name -ne 'kusakari-canvas') {
    throw 'Canvas repository not found.'
}
$verificationRoot = Join-Path ([IO.Path]::GetTempPath()) ('kusakari-portable-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $verificationRoot -ErrorAction Stop | Out-Null
foreach ($entry in @(@($sourceEc, 'EC 空白 検証'), @($sourceCanvas, 'Canvas 空白 検証'))) {
    $source = $entry[0]
    $destination = Join-Path $verificationRoot $entry[1]
    # Source files only, including the user's not-yet-committed feature files.
    $files = @(& git -C $source -c core.quotepath=false ls-files -c -o --exclude-standard | Sort-Object -Unique)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot enumerate repository source files.' }
    foreach ($file in $files) {
        if ($file -match '^(artifacts|\.runtime|node_modules|frontend/dist|backend/(target|\.venv))/' -or
            $file -match '(^|/)(\.env($|\.(?!example$))|bin/|obj/)' -or
            $file -match '^sysover-ray2/verification/') { continue }
        $sourceFile = Join-Path $source $file
        if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) { continue }
        $target = [IO.Path]::GetFullPath((Join-Path $destination $file))
        if (-not $target.StartsWith($destination + '\', [StringComparison]::OrdinalIgnoreCase)) {
            throw 'A source path escaped the new verification directory.'
        }
        New-Item -ItemType Directory -Path (Split-Path $target) -Force | Out-Null
        Copy-Item -LiteralPath $sourceFile -Destination $target -ErrorAction Stop
    }
    foreach ($excluded in @('.env', '.env.e2e', 'node_modules', 'backend/.venv', '.runtime')) {
        if (Test-Path -LiteralPath (Join-Path $destination $excluded)) { throw 'Runtime state entered the clean copy.' }
    }
}
Write-Output $verificationRoot
