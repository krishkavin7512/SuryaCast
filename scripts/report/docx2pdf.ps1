param([string]$Src, [string]$Dst, [int]$TimeoutSec = 120)
# Converts a .docx to PDF with Word COM, with a watchdog that kills only the Word
# instance this script started if it hangs on a hidden dialog.
$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object { $_.Id })
$job = Start-Job -ScriptBlock {
  param($s, $d)
  $w = New-Object -ComObject Word.Application
  $w.Visible = $false
  $w.DisplayAlerts = 0
  $w.AutomationSecurity = 3
  try {
    $doc = $w.Documents.Open($s, $false, $true, $false)
    $doc.Fields.Update() | Out-Null
    foreach ($t in $doc.TablesOfContents) { $t.Update() | Out-Null }
    $doc.SaveAs2($d, 17)
    $n = $doc.ComputeStatistics(2)
    $doc.Close($false)
    "pages=$n"
  } finally { $w.Quit() }
} -ArgumentList $Src, $Dst
if (Wait-Job $job -Timeout $TimeoutSec) {
  Receive-Job $job
} else {
  "TIMEOUT after $TimeoutSec s"
  Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | Stop-Process -Force
  Stop-Job $job
}
Remove-Job $job -Force
