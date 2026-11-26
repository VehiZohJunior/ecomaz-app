# EcoMaZ — Voix off des vidéos : synthèse vocale Windows (voix française Hortense, gratuite, hors ligne).
# Usage : powershell -File tools/guide/voix.ps1 <fichier.json>   ([{ "texte": "...", "fichier": "C:\...\01.wav" }, ...])
param([string]$liste)
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$v = $s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -eq 'fr-FR' } | Select-Object -First 1
if ($v) { $s.SelectVoice($v.VoiceInfo.Name) }
$s.Rate = 1
$items = Get-Content -Raw -Encoding UTF8 $liste | ConvertFrom-Json
foreach ($it in $items) {
  $fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  $s.SetOutputToWaveFile($it.fichier, $fmt)
  $s.Speak($it.texte)
  $s.SetOutputToNull()
}
$s.Dispose()
Write-Output ("{0} voix" -f $items.Count)
