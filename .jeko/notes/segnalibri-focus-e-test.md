# Segnalibri: corsa con il focus della finestra, e come testare

- `Neutralino.os.showMessageBox` toglie il fuoco alla finestra: alla chiusura scatta `focus`, che
  rilegge i segnalibri da disco (`reloadBookmarks`), anche prima che il codice dopo l'`await` della
  conferma giri. Una lettura partita prima di un salvataggio restituisce dati vecchi.
- Soluzione in `storage.js`: `saveBookmark` mette in coda le scritture (`bookmarkWrites`) e incrementa
  `bookmarkChanges`; `loadBookmarks` aspetta la coda e rilegge se nel frattempo c'è stata una modifica.
  Nuove letture/scritture dei segnalibri devono passare da queste due funzioni.
- `visited.splice(visited.indexOf(x), 1)` con indice -1 cancella l'ultima voce: controllare sempre l'indice.
- Test: gli script non sono moduli, quindi i test caricano `storage.js` con `vm` e un finto `Neutralino`
  (vedi `tests/bookmarks.test.js`). Con Node 24 `node --test tests/` fallisce: serve il glob
  `"tests/**/*.test.js"`.
