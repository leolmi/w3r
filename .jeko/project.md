# w3r

Visualizzatore e stampa di file Markdown per Windows, con Neutralinojs.

## Stack
- Neutralinojs (`@neutralinojs/neu`), JavaScript puro senza bundler né moduli: gli script in
  `resources/index.html` si caricano con `<script>` e condividono lo scope globale.
- Librerie (marked, DOMPurify, highlight.js, KaTeX, Mermaid) copiate in `resources/vendor` da
  `scripts/copy-vendor.js` al `postinstall`.

## Struttura
- `resources/js/main.js`: interfaccia (colonne, elenco dei file, segnalibri, editor).
- `resources/js/storage.js`: dati persistenti in `%APPDATA%\w3r` (impostazioni, segnalibri, istanze, sessione).
- `resources/js/updater.js`: aggiornamento automatico.
- `scripts/`: build dell'installer, pacchetto, rilascio.
- `tests/`: test con `node:test` (incluso in Node, nessuna dipendenza).

## Convenzioni
- Testi dell'interfaccia in italiano; commenti nel codice in inglese.
- Commit con il messaggio in italiano (es. "Versione 1.4.0: ...").
