$ErrorActionPreference = 'SilentlyContinue'
$killed = 0

$procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
foreach ($p in $procs) {
  $cmd = [string]$p.CommandLine
  if ($cmd -like '*tg_mdm*index.js*' -or $cmd -match 'node\.exe"\s+index\.js') {
    try {
      Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop
      $killed++
      Write-Host ("[INFO] Stopped tg_mdm bot PID " + $p.ProcessId + ".")
    } catch {
      Write-Host ("[WARN] Could not stop tg_mdm bot PID " + $p.ProcessId + ".")
    }
  }
}

if ($killed -gt 0) {
  exit 2
}

Write-Host "[INFO] tg_mdm bot is not running."
exit 0
