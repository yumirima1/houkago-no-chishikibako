param(
  [ValidateSet('Install','Status','Start','Stop','Remove','Run')][string]$Action='Status',
  [string]$Config='config/kousatsu-backend.json',
  [string]$TaskSuffix=''
)
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
if ([IO.Path]::IsPathRooted($Config)) { $configPath=[IO.Path]::GetFullPath($Config) }
else { $configPath=[IO.Path]::GetFullPath((Join-Path $projectRoot $Config)) }
$configuration=Get-Content -LiteralPath $configPath -Encoding UTF8 -Raw | ConvertFrom-Json
$dataRoot=[IO.Path]::GetFullPath($configuration.dataDirectory)
if ($dataRoot -notmatch '^D:\\') { throw 'Backend data must remain on D:.' }
if ($TaskSuffix -and $TaskSuffix -notmatch '^test-[a-zA-Z0-9-]+$') { throw 'Only test-* task suffixes are accepted.' }
if ($TaskSuffix -and $dataRoot -notmatch '\\Validation\\') { throw 'Test tasks require an isolated Validation data directory.' }
$hasher=[Security.Cryptography.SHA256]::Create()
try { $projectHash=([BitConverter]::ToString($hasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-','').Substring(0,10) }
finally { $hasher.Dispose() }
$taskName='KousatsuBackend-'+$projectHash
if ($TaskSuffix) { $taskName+='-'+$TaskSuffix }
$description='Kousatsu autonomous backend owned by '+$projectRoot+'; config='+$configPath
$nodePath=(Get-Command node.exe -ErrorAction Stop).Source
$scriptPath=Join-Path $projectRoot 'scripts/kousatsu-backend.ts'
$launcherPath=Join-Path $projectRoot 'scripts/kousatsu-task.ps1'
$powerShellPath=Join-Path $PSHOME 'powershell.exe'
$arguments='-NoProfile -NonInteractive -WindowStyle Hidden -File "'+$launcherPath+'" -Action Run -Config "'+$configPath+'"'
if ($TaskSuffix) { $arguments+=' -TaskSuffix "'+$TaskSuffix+'"' }
$marker=Join-Path $dataRoot 'Logs/STOP'

if ($Action -eq 'Run') {
  if (Test-Path -LiteralPath $marker) { exit 0 }
  $env:NEXT_TELEMETRY_DISABLED='1'
  $logDirectory=Join-Path $dataRoot 'Logs'
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  $logFile=Join-Path $logDirectory ('scheduler-'+[DateTime]::UtcNow.ToString('yyyy-MM-dd')+'.log')
  if ((Test-Path -LiteralPath $logFile) -and (Get-Item -LiteralPath $logFile).Length -gt 10MB) { throw 'SCHEDULER_LOG_CAPACITY_LIMIT' }
  # No detached visible console. Task Scheduler owns this entire process tree.
  & $nodePath '--import' 'tsx' $scriptPath 'daemon' '--config' $configPath >> $logFile 2>&1
  exit $LASTEXITCODE
}

$existing=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Description -ne $description -or $existing.Actions.Arguments -ne $arguments -or
  $existing.Actions.Execute -ne $powerShellPath -or $existing.Actions.WorkingDirectory -ne $projectRoot)) {
  throw 'TASK_OWNERSHIP_MISMATCH: refusing to modify an existing task.'
}
if ($Action -eq 'Install') {
  if ($existing) { throw 'TASK_ALREADY_EXISTS: inspect it; existing tasks are never overwritten.' }
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent().Name
  $taskAction=New-ScheduledTaskAction -Execute $powerShellPath -Argument $arguments -WorkingDirectory $projectRoot
  $logon=New-ScheduledTaskTrigger -AtLogOn -User $identity
  $hourly=New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
  $principal=New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
  $settings=New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $taskName -Description $description -Action $taskAction -Trigger @($logon,$hourly) -Principal $principal -Settings $settings | Out-Null
} elseif ($Action -eq 'Start') {
  if (-not $existing) { throw 'TASK_NOT_INSTALLED' }
  # Only remove the exact stop marker of this installation, never user data.
  if (Test-Path -LiteralPath $marker) { Remove-Item -LiteralPath $marker }
  Enable-ScheduledTask -TaskName $taskName | Out-Null
  Start-ScheduledTask -TaskName $taskName
} elseif ($Action -eq 'Stop') {
  if (-not $existing) { throw 'TASK_NOT_INSTALLED' }
  New-Item -ItemType Directory -Path (Split-Path $marker) -Force | Out-Null
  [IO.File]::WriteAllText($marker,'Graceful stop requested '+[DateTime]::UtcNow.ToString('o'))
  Disable-ScheduledTask -TaskName $taskName | Out-Null
} elseif ($Action -eq 'Remove') {
  if (-not $existing) { throw 'TASK_NOT_INSTALLED' }
  if ($existing.State -eq 'Running') { throw 'TASK_RUNNING: Stop and wait for the current cycle before Remove.' }
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}
$task=Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$info=if ($task) { Get-ScheduledTaskInfo -TaskName $taskName } else { $null }
[pscustomobject]@{TaskName=$taskName;Registered=[bool]$task;State=[string]$task.State;LastTaskResult=$info.LastTaskResult;
  LastRunTime=$info.LastRunTime;NextRunTime=$info.NextRunTime;Command=$powerShellPath;Arguments=$arguments;
  WorkingDirectory=$projectRoot;DataDirectory=$dataRoot;LogDirectory=(Join-Path $dataRoot 'Logs');
  StopCommand=('powershell -NoProfile -File scripts/kousatsu-task.ps1 -Action Stop -Config "'+$configPath+'"') } | ConvertTo-Json -Depth 4
