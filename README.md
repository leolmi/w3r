# w3r

Visualizzatore e stampa di file Markdown **multipiattaforma** (Windows, macOS, Linux), basato su [Neutralinojs](https://neutralino.js.org).

## Sviluppo

```bash
npm install         # dipendenze + binari Neutralino
npm run dev         # avvio in modalità sviluppo
npm run build       # eseguibili per tutte le piattaforme in dist/w3r/
npm run installer   # installer Windows in dist/w3r-setup-<versione>.exe (richiede Inno Setup 6)
```

## Piattaforme supportate

Un solo `npm run build`, eseguibile da qualsiasi sistema, produce in `dist/w3r/` un binario autonomo
(risorse incorporate) per ogni piattaforma:

| Sistema | File | Requisiti |
|---|---|---|
| Windows x64 | `w3r-win_x64.exe` | WebView2 (già presente su Windows 10/11) |
| macOS Intel | `w3r-mac_x64` | — |
| macOS Apple Silicon | `w3r-mac_arm64` | — |
| macOS universale | `w3r-mac_universal` | — |
| Linux x64 | `w3r-linux_x64` | WebKitGTK (`libwebkit2gtk-4.1`, di solito già installato) |
| Linux ARM64 | `w3r-linux_arm64` | WebKitGTK |
| Linux ARMv7 (es. Raspberry Pi) | `w3r-linux_armhf` | WebKitGTK |

Impostazioni e posizione delle finestre sono salvate nella cartella dati dell'utente:
`%APPDATA%\w3r` (Windows), `~/Library/Application Support/w3r` (macOS), `~/.local/share/w3r` (Linux).

## Distribuzione

### Windows

- **Portabile**: basta copiare `w3r-win_x64.exe`.
- **Installer**: installazione per utente (senza diritti di amministratore), collegamento nel menu Start
  e associazione dei file `.md`.

### macOS e Linux

Solo versione portabile: si copia il binario della propria architettura e lo si rende eseguibile.

```bash
chmod +x w3r-linux_x64
./w3r-linux_x64 documento.md
```

Su macOS il binario non è firmato: al primo avvio Gatekeeper lo blocca. Per sbloccarlo, rimuovi l'attributo
di quarantena con `xattr -d com.apple.quarantine w3r-mac_arm64` oppure usa *Impostazioni di Sistema → Privacy e
sicurezza → Apri comunque*. Collegamenti nel menu, associazione dei file `.md` e bundle `.app` non sono
generati automaticamente.

## Scorciatoie

Su macOS Ctrl è sostituito da Cmd.

| Scorciatoia | Azione |
|---|---|
| Ctrl+O | Apri file |
| Ctrl+P | Stampa |
| Alt+← / Alt+→ | Indietro / Avanti |
