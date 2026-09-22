#Requires -Version 5.1
<#
.SYNOPSIS
    构建并部署「峡谷全随机构筑器」的 H5 产物到静态服务器。

.DESCRIPTION
    沿用服务器上既有的约定（与 huohandu.cn 一致）：
      /var/www/<domain>/releases/<时间戳>/   每个版本一个目录
      /var/www/<domain>/current              指向当前版本的软链
    回滚 = 把 current 切回上一个 releases 目录，不需要重新上传。

    上传后会比对本地与远端的 sha256，避免半截产物上线。

.EXAMPLE
    pwsh scripts/deploy.ps1
    pwsh scripts/deploy.ps1 -SkipBuild          # 复用已有产物，只做发布
    pwsh scripts/deploy.ps1 -SshHost tencent -Domain rift.huohandu.cn
#>
[CmdletBinding()]
param(
    [string]$SshHost = 'tencent',
    [string]$Domain = 'rift.huohandu.cn',
    [string]$WebRoot = '/var/www',
    [string]$Owner = 'ubuntu',
    [int]$KeepReleases = 5,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

function Step([string]$message) { Write-Host "→ $message" -ForegroundColor Cyan }
function Ok([string]$message) { Write-Host "  $message" -ForegroundColor DarkGray }

$repo = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $repo 'dist/build/h5'
$releaseDir = "$WebRoot/$Domain"

Push-Location $repo
try {
    # 1) 构建
    if (-not $SkipBuild) {
        Step '构建 H5 产物…'
        npm run build:h5
        if ($LASTEXITCODE -ne 0) { throw 'npm run build:h5 失败' }
    }
    if (-not (Test-Path $dist)) { throw "找不到产物目录：$dist" }

    # 2) 打包
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $tgz = Join-Path $env:TEMP "lol-h5-$stamp.tgz"
    Step "打包 → $tgz"
    tar -czf $tgz -C $dist .
    if ($LASTEXITCODE -ne 0) { throw 'tar 打包失败' }
    $localHash = (Get-FileHash $tgz -Algorithm SHA256).Hash.ToLower()
    Ok "本地 sha256 $localHash"

    # 3) 上传 + 校验
    $remoteTmp = "/tmp/lol-h5-$stamp.tgz"
    Step "上传到 $SshHost …"
    scp -q $tgz "${SshHost}:$remoteTmp"
    if ($LASTEXITCODE -ne 0) { throw 'scp 上传失败' }

    $remoteHash = (ssh $SshHost "sha256sum $remoteTmp" 2>&1 | Out-String).Trim().Split(' ')[0]
    if ($remoteHash -ne $localHash) {
        throw "上传校验失败：本地 $localHash / 远端 $remoteHash"
    }
    Ok '校验和一致'

    # 4) 解包、切软链、清理旧版本
    $release = "$releaseDir/releases/$stamp"
    Step "发布到 $release …"
    $remoteScript = @"
set -e
sudo mkdir -p '$release'
sudo tar -xzf '$remoteTmp' -C '$release'
sudo chown -R ${Owner}:${Owner} '$releaseDir'
sudo ln -sfn '$release' '$releaseDir/current'
rm -f '$remoteTmp'
cd '$releaseDir/releases'
ls -1dt */ | tail -n +$($KeepReleases + 1) | xargs -r sudo rm -rf
"@
    ssh $SshHost $remoteScript
    if ($LASTEXITCODE -ne 0) { throw '远端发布失败' }

    # 5) 健康检查
    Step '健康检查…'
    $status = (curl.exe -sS -o NUL -w '%{http_code}' "https://$Domain/").Trim()
    if ($status -ne '200') { throw "https://$Domain/ 返回 $status（期望 200）" }
    Ok "https://$Domain/ → 200"

    # 入口 HTML 里 src / href 引用的资源都要能取到（CSS 是 href，script 是 src）
    $html = curl.exe -sS "https://$Domain/"
    $paths = [regex]::Matches($html, '(?:src|href)="(/assets/[^"]+)"') |
        ForEach-Object { $_.Groups[1].Value } |
        Sort-Object -Unique
    if ($paths.Count -eq 0) { throw '入口 HTML 里没有解析到任何 /assets/ 引用' }
    foreach ($path in $paths) {
        $code = (curl.exe -sS -o NUL -w '%{http_code}' "https://$Domain$path").Trim()
        if ($code -ne '200') { throw "入口引用的资源 $path 返回 $code" }
        Ok "$path → 200"
    }

    # 逐个文件对齐本地产物与远端版本目录，防止「少传了某个 chunk」
    $localFiles = Get-ChildItem -Recurse -File $dist |
        ForEach-Object { $_.FullName.Substring($dist.Length).TrimStart('\', '/') -replace '\\', '/' } |
        Sort-Object
    $remoteFiles = (ssh $SshHost "cd '$release' && find . -type f | sed 's|^\./||' | sort" 2>&1) |
        Where-Object { $_ -and $_ -notmatch '^\s*$' } |
        ForEach-Object { $_.Trim() } |
        Sort-Object

    $missing = Compare-Object $localFiles $remoteFiles |
        Where-Object { $_.SideIndicator -eq '<=' } |
        ForEach-Object { $_.InputObject }
    if ($missing) { throw "远端缺少文件：$($missing -join ', ')" }
    if ($localFiles.Count -ne $remoteFiles.Count) {
        throw "文件数不一致：本地 $($localFiles.Count) / 远端 $($remoteFiles.Count)（远端多出：$((Compare-Object $localFiles $remoteFiles | Where-Object SideIndicator -eq '=>').InputObject -join ', ')）"
    }
    Ok "产物文件 $($localFiles.Count) 个，与远端完全一致"

    # 6) 收尾
    Remove-Item $tgz -Force -ErrorAction SilentlyContinue
    Write-Host ''
    Write-Host "✅ 已发布 $release" -ForegroundColor Green
    Write-Host "   回滚：ssh $SshHost 后执行" -ForegroundColor DarkGray
    Write-Host "     sudo ln -sfn $releaseDir/releases/<上一个时间戳> $releaseDir/current" -ForegroundColor DarkGray
}
finally {
    Pop-Location
}
