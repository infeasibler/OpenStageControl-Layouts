$ErrorActionPreference = 'Stop'

$openStageRoot = 'C:\RemoteControl\RemoteControl\open-stage-control_1.31.2_win32-x64\open-stage-control_1.31.2_win32-x64'
$openStageExecutable = Join-Path $openStageRoot 'open-stage-control.exe'
$openStageApp = Join-Path $openStageRoot 'resources\app'
$layout = Join-Path $PSScriptRoot 'xControl-smaller.json'
$theme = Join-Path $PSScriptRoot 'xcontrol .css'
$customModule = Join-Path $PSScriptRoot 'reaper-follow-selected.js'
$bridge = Join-Path $PSScriptRoot 'reaper-visible-tracks-bridge.js'

foreach ($file in @($openStageExecutable, $openStageApp, $layout, $theme, $customModule, $bridge)) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required X-Control file not found: $file"
    }
}

$existingServer = $false
$portOwners = Get-NetUDPEndpoint -LocalPort 9000 -ErrorAction SilentlyContinue
foreach ($endpoint in $portOwners) {
    $owner = Get-Process -Id $endpoint.OwningProcess -ErrorAction SilentlyContinue
    if ($owner.ProcessName -ne 'open-stage-control') {
        throw "OSC port 9000 is already in use by $($owner.ProcessName)."
    }
    $existingServer = $true
}

$node = (Get-Command node.exe -ErrorAction Stop).Source
$bridgeProcess = Start-Process -FilePath $node -ArgumentList "`"$bridge`"" -PassThru

try {
    Start-Sleep -Milliseconds 500
    if ($bridgeProcess.HasExited) {
        throw 'The collapsed-track bridge exited during startup.'
    }

    if ($existingServer) {
        Write-Host 'Open Stage Control is already running; the bridge will stop when its port closes.'
        while (Get-NetUDPEndpoint -LocalPort 9000 -ErrorAction SilentlyContinue |
            Where-Object {
                (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName -eq 'open-stage-control'
            }) {
            Start-Sleep -Seconds 1
        }
    } else {
        $serverArguments = @(
            "`"$openStageApp`""
            '--no-gui'
            '--load'
            "`"$layout`""
            '--theme'
            "`"$theme`""
            '--send'
            '127.0.0.1:8000'
            '--osc-port'
            '9000'
            '--custom-module'
            "`"$customModule`""
        ) -join ' '
        $serverProcess = Start-Process -FilePath $openStageExecutable -ArgumentList $serverArguments -PassThru
        $serverProcess.WaitForExit()

        if ($serverProcess.ExitCode -ne 0) {
            throw "Open Stage Control exited with code $($serverProcess.ExitCode)."
        }
    }
} finally {
    if (-not $bridgeProcess.HasExited) {
        Stop-Process -Id $bridgeProcess.Id
        $bridgeProcess.WaitForExit()
    }
}
