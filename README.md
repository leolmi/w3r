# w3r

Visualizzatore e stampa di file Markdown per Windows, basato su [Neutralinojs](https://neutralino.js.org).

## Sviluppo

```bash
npm install         # dipendenze + binari Neutralino
npm run dev         # avvio in modalità sviluppo
npm run build       # exe unico in dist/w3r/w3r-win_x64.exe
npm run installer   # installer in dist/w3r-setup-<versione>.exe (richiede Inno Setup 6)
```

## Distribuzione

- **Portabile**: basta copiare `dist/w3r/w3r-win_x64.exe`.
- **Installer**: installazione per utente (senza diritti di amministratore), collegamento nel menu Start
  e associazione dei file `.md`.

Richiede WebView2 (già presente su Windows 10/11).

| Scorciatoia | Azione |
|---|---|
| Ctrl+O | Apri file |
| Ctrl+P | Stampa |
| Alt+← / Alt+→ | Indietro / Avanti |
