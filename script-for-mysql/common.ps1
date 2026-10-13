$ErrorActionPreference = 'Stop'

function Find-KusakariEcProjectRoot {
    $directory = Get-Item -LiteralPath (Split-Path $PSScriptRoot -Parent)
    while ($directory) {
        $root = $directory.FullName
        if ((Test-Path -LiteralPath (Join-Path $root 'package.json') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root 'package-lock.json') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root 'backend\pom.xml') -PathType Leaf) -and
            (Test-Path -LiteralPath (Join-Path $root 'scripts\setup-existing-mysql.ps1') -PathType Leaf)) {
            try {
                $package = Get-Content -Raw -LiteralPath (Join-Path $root 'package.json') | ConvertFrom-Json
                $frontend = Get-Content -Raw -LiteralPath (Join-Path $root 'frontend\package.json') | ConvertFrom-Json
                [xml]$pom = Get-Content -Raw -LiteralPath (Join-Path $root 'backend\pom.xml')
                $namespace = New-Object System.Xml.XmlNamespaceManager($pom.NameTable)
                $namespace.AddNamespace('m', 'http://maven.apache.org/POM/4.0.0')
                $groupId = $pom.SelectSingleNode('/m:project/m:groupId', $namespace).InnerText
                $artifactId = $pom.SelectSingleNode('/m:project/m:artifactId', $namespace).InnerText
                if ($package.name -eq 'kusakari-ec' -and
                    $frontend.name -eq '@kusakari-ec/frontend' -and
                    $groupId -eq 'jp.kusakari.ec' -and
                    $artifactId -eq 'kusakari-ec-api') {
                    return $root
                }
            } catch { }
        }
        $directory = $directory.Parent
    }
    throw 'kusakari-ec のルートを特定できません。script-for-mysqlをプロジェクト内に置いてください。'
}

$projectRoot = Find-KusakariEcProjectRoot
