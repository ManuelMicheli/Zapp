/**
 * Lo script che concede da solo l'accesso alle notifiche a un'app TV.
 *
 * La pagina `/devices/connect/tv` spiega gli stessi passi a mano; questo file
 * li mette in un unico file da aprire, con dentro gia' l'indirizzo della TV e
 * il servizio da abilitare. Serve perche' il destinatario tipico non e' chi ha
 * installato l'app: e' un amico dall'altra parte della citta' che ha un
 * televisore e nessuna voglia di aprire un terminale.
 *
 * Lo script fa **anche** la cosa che a mano si sbaglia: legge l'elenco degli
 * ascoltatori di notifiche gia' abilitati e ci accoda il nostro, invece di
 * riscriverlo — `settings put secure enabled_notification_listeners`
 * sostituisce tutto, e a mano si spegne il permesso alle altre app della TV.
 *
 * Quello che resta all'utente non lo puo' fare nessuno da remoto: accendere
 * Debug ADB sul televisore e confermare il popup che compare a schermo.
 */

import { ASCOLTATORI, normalizzaIp, type AppTv, type Sistema } from "./listeners";

const BASE_GOOGLE = "https://dl.google.com/android/repository";

/** Il marcatore che separa le righe di cmd dal corpo PowerShell del `.bat`. */
const MARCATORE = "ZAPPBAT";

export function nomeFile(sistema: Sistema): string {
  return sistema === "windows"
    ? "attiva-tracciamento-zapp.bat"
    : "attiva-tracciamento-zapp.command";
}

/** Il tipo giusto per far scaricare il file invece di mostrarlo. */
export function tipoFile(sistema: Sistema): string {
  return sistema === "windows"
    ? "application/bat; charset=utf-8"
    : "application/x-sh; charset=utf-8";
}

/**
 * Il testo dello script. `ip` finisce dentro un file eseguibile: se non e' un
 * IPv4 si rifiuta, non si ripulisce. La pagina valida gia', questo e' il
 * secondo muro — l'unico che regge se un domani qualcuno chiama la rotta a mano.
 */
export function scriptTv(sistema: Sistema, ip: string, app: AppTv): string {
  const indirizzo = normalizzaIp(ip);
  if (indirizzo === null) throw new Error("indirizzo non valido");
  const { componente, etichetta } = ASCOLTATORI[app];
  const corpo =
    sistema === "windows"
      ? windows(indirizzo, componente, etichetta)
      : unix(indirizzo, componente, etichetta);
  return sistema === "windows" ? corpo.replace(/\n/g, "\r\n") : corpo;
}

/**
 * Un `.bat` che si apre col doppio clic e passa il resto di se stesso a
 * PowerShell: cmd non sa maneggiare stringhe con `/` e `:` senza impazzire,
 * PowerShell si'. `findstr` toglie le righe di cmd — le uniche col marcatore —
 * e salva il resto come `.ps1`; `-File` invece di `-Command -` perche' con lo
 * script su stdin `Read-Host` non riceverebbe piu' niente e la finestra si
 * chiuderebbe in faccia all'utente.
 */
function windows(ip: string, componente: string, etichetta: string): string {
  const cmd = [
    `@echo off & rem ${MARCATORE}`,
    `chcp 65001 > nul & rem ${MARCATORE}`,
    `findstr /v /c:"${MARCATORE}" "%~f0" > "%TEMP%\\attiva-tracciamento-zapp.ps1" & rem ${MARCATORE}`,
    `powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\\attiva-tracciamento-zapp.ps1" & rem ${MARCATORE}`,
    `exit /b & rem ${MARCATORE}`,
  ].join("\n");

  const ps = `
$ErrorActionPreference = "Continue"
$ip = "${ip}"
$servizio = "${componente}"
$app = "${etichetta}"
$bersaglio = $ip + ":5555"
$cartella = Join-Path $env:TEMP "zapp-tv-adb"
$adb = Join-Path $cartella "platform-tools\\adb.exe"

function Fine($messaggio) {
  Write-Host ""
  Write-Host $messaggio
  Write-Host ""
  Read-Host "Premi Invio per chiudere"
  exit
}

# pkg/.Classe e pkg/pkg.Classe sono lo stesso servizio: Android espande il punto
# iniziale col nome del pacchetto. Senza, un permesso gia' concesso sembrerebbe
# mancante e lo scriveremmo due volte.
function Espandi($voce) {
  $taglio = $voce.IndexOf("/")
  if ($taglio -lt 0) { return $voce }
  $pacchetto = $voce.Substring(0, $taglio)
  $classe = $voce.Substring($taglio + 1)
  if ($classe.StartsWith(".")) { return $pacchetto + "/" + $pacchetto + $classe }
  return $voce
}

Write-Host "Zapp - tracciamento completo per $app"
Write-Host "Televisore: $ip"
Write-Host ""
Write-Host "Sulla TV, prima di continuare:"
Write-Host "  Impostazioni > Il mio Fire TV > Opzioni sviluppatore > Debug ADB acceso"
Write-Host ""
Read-Host "Quando Debug ADB e' acceso, premi Invio"

if (-not (Test-Path $adb)) {
  Write-Host ""
  Write-Host "Scarico gli strumenti Android da Google (una volta sola, circa 15 MB)..."
  try {
    New-Item -ItemType Directory -Force -Path $cartella | Out-Null
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $zip = Join-Path $cartella "platform-tools.zip"
    Invoke-WebRequest -UseBasicParsing -Uri "${BASE_GOOGLE}/platform-tools-latest-windows.zip" -OutFile $zip
    Expand-Archive -Force -LiteralPath $zip -DestinationPath $cartella
  } catch {
    Fine "Non sono riuscito a scaricare gli strumenti. Controlla la connessione e riprova."
  }
}
if (-not (Test-Path $adb)) { Fine "Strumenti scaricati ma adb non e' al suo posto. Riprova." }

Write-Host ""
Write-Host "Mi collego al televisore..."
& $adb connect $bersaglio | Out-Null
$stato = ""
for ($i = 0; $i -lt 40; $i++) {
  $stato = (& $adb -s $bersaglio get-state | Select-Object -Last 1)
  if ($stato -eq "device") { break }
  if ($i -eq 0) {
    Write-Host "Guarda il televisore: chiede 'Consentire il debug USB?'. Scegli Consenti sempre."
    Write-Host "Aspetto..."
  }
  & $adb connect $bersaglio | Out-Null
  Start-Sleep -Seconds 2
}
if ($stato -ne "device") {
  Fine "Non riesco a parlare con la TV. Controlla che sia accesa, sulla stessa rete, con Debug ADB acceso, e che l'indirizzo sia $ip."
}

Write-Host "Leggo i permessi gia' presenti sul televisore..."
$vecchio = ((& $adb -s $bersaglio shell settings get secure enabled_notification_listeners) -join "").Trim()
if ($vecchio -eq "null") { $vecchio = "" }
$voci = @()
if ($vecchio -ne "") {
  $voci = @($vecchio.Split(":") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
}

$atteso = Espandi $servizio
$gia = $false
foreach ($voce in $voci) { if ((Espandi $voce) -eq $atteso) { $gia = $true } }

if ($gia) {
  Write-Host "Il permesso c'era gia': non tocco niente."
} else {
  # Le altre app restano: si accoda, non si sostituisce.
  $nuovo = (@($voci + $servizio) -join ":")
  Write-Host "Aggiungo $app ai permessi, lasciando le altre app come stanno..."
  & $adb -s $bersaglio shell settings put secure enabled_notification_listeners $nuovo | Out-Null
}

$controllo = ((& $adb -s $bersaglio shell settings get secure enabled_notification_listeners) -join "").Trim()
$ok = $false
foreach ($voce in $controllo.Split(":")) { if ((Espandi $voce.Trim()) -eq $atteso) { $ok = $true } }
& $adb disconnect $bersaglio | Out-Null

if (-not $ok) {
  Fine "Il permesso non risulta attivo. Riprova, oppure segui i passi a mano sulla pagina di Zapp."
}

Fine "Fatto. Ora sul televisore chiudi e riapri \${app}: deve dire 'Tracciamento completo'. Poi puoi rispegnere Debug ADB nelle opzioni sviluppatore."
`;

  return `${cmd}\n${ps.trimStart()}`;
}

/**
 * La stessa cosa per Mac e Linux. Il file e' `.command` perche' su Mac e' il
 * tipo che il Terminale riconosce; scaricato non ha il permesso di esecuzione,
 * quindi la pagina fa incollare una riga sola (`bash <file>`).
 */
function unix(ip: string, componente: string, etichetta: string): string {
  return `#!/usr/bin/env bash
# Zapp — accesso alle notifiche per ${etichetta} sulla TV ${ip}.
# Legge i permessi gia' presenti e ci accoda il servizio: le altre app restano.
set -u

IP="${ip}"
SERVIZIO="${componente}"
APP="${etichetta}"
BERSAGLIO="$IP:5555"
CARTELLA="\${TMPDIR:-/tmp}/zapp-tv-adb"
ADB="$CARTELLA/platform-tools/adb"

case "$(uname -s)" in
  Darwin) URL="${BASE_GOOGLE}/platform-tools-latest-darwin.zip" ;;
  *) URL="${BASE_GOOGLE}/platform-tools-latest-linux.zip" ;;
esac

fine() {
  echo ""
  echo "$1"
  echo ""
  read -r -p "Premi Invio per chiudere" _
  exit 0
}

# pkg/.Classe e pkg/pkg.Classe sono lo stesso servizio: Android espande il punto
# iniziale col nome del pacchetto.
espandi() {
  case "$1" in
    */.*) echo "\${1%%/*}/\${1%%/*}\${1#*/}" ;;
    *) echo "$1" ;;
  esac
}

echo "Zapp - tracciamento completo per $APP"
echo "Televisore: $IP"
echo ""
echo "Sulla TV, prima di continuare:"
echo "  Impostazioni > Il mio Fire TV > Opzioni sviluppatore > Debug ADB acceso"
echo ""
read -r -p "Quando Debug ADB e' acceso, premi Invio" _

if [ ! -x "$ADB" ]; then
  echo ""
  echo "Scarico gli strumenti Android da Google (una volta sola, circa 15 MB)..."
  mkdir -p "$CARTELLA" || fine "Non riesco a scrivere in $CARTELLA."
  curl -fL --progress-bar -o "$CARTELLA/platform-tools.zip" "$URL" ||
    fine "Non sono riuscito a scaricare gli strumenti. Controlla la connessione."
  unzip -o -q "$CARTELLA/platform-tools.zip" -d "$CARTELLA" ||
    fine "Non sono riuscito ad aprire l'archivio scaricato."
fi
[ -x "$ADB" ] || fine "Strumenti scaricati ma adb non e' al suo posto. Riprova."

echo ""
echo "Mi collego al televisore..."
"$ADB" connect "$BERSAGLIO" > /dev/null 2>&1
stato=""
for i in $(seq 1 40); do
  stato="$("$ADB" -s "$BERSAGLIO" get-state 2>/dev/null | tail -n 1)"
  [ "$stato" = "device" ] && break
  if [ "$i" = "1" ]; then
    echo "Guarda il televisore: chiede 'Consentire il debug USB?'. Scegli Consenti sempre."
    echo "Aspetto..."
  fi
  "$ADB" connect "$BERSAGLIO" > /dev/null 2>&1
  sleep 2
done
[ "$stato" = "device" ] ||
  fine "Non riesco a parlare con la TV. Controlla che sia accesa, sulla stessa rete, con Debug ADB acceso, e che l'indirizzo sia $IP."

echo "Leggo i permessi gia' presenti sul televisore..."
vecchio="$("$ADB" -s "$BERSAGLIO" shell settings get secure enabled_notification_listeners | tr -d '\\r' | tr -d '\\n')"
[ "$vecchio" = "null" ] && vecchio=""

atteso="$(espandi "$SERVIZIO")"
nuovo=""
gia="no"
IFS=':' read -r -a voci <<< "$vecchio"
for voce in "\${voci[@]:-}"; do
  [ -z "$voce" ] && continue
  [ "$(espandi "$voce")" = "$atteso" ] && gia="si"
  nuovo="\${nuovo:+$nuovo:}$voce"
done

if [ "$gia" = "si" ]; then
  echo "Il permesso c'era gia': non tocco niente."
else
  # Le altre app restano: si accoda, non si sostituisce.
  nuovo="\${nuovo:+$nuovo:}$SERVIZIO"
  echo "Aggiungo $APP ai permessi, lasciando le altre app come stanno..."
  "$ADB" -s "$BERSAGLIO" shell settings put secure enabled_notification_listeners "$nuovo" > /dev/null
fi

controllo="$("$ADB" -s "$BERSAGLIO" shell settings get secure enabled_notification_listeners | tr -d '\\r' | tr -d '\\n')"
"$ADB" disconnect "$BERSAGLIO" > /dev/null 2>&1

ok="no"
IFS=':' read -r -a finali <<< "$controllo"
for voce in "\${finali[@]:-}"; do
  [ "$(espandi "$voce")" = "$atteso" ] && ok="si"
done

[ "$ok" = "si" ] ||
  fine "Il permesso non risulta attivo. Riprova, oppure segui i passi a mano sulla pagina di Zapp."

fine "Fatto. Ora sul televisore chiudi e riapri $APP: deve dire 'Tracciamento completo'. Poi puoi rispegnere Debug ADB nelle opzioni sviluppatore."
`;
}
