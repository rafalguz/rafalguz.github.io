/* SISU23 - kanał aktualizacji online (bez danych gości i bez dostępu do Home Assistanta).
   Aktualizuj ten plik, aby zmienić teksty, styl i funkcje interfejsu telewizorów.
   Kod działa wewnątrz zainstalowanej aplikacji. Publikuj wyłącznie sprawdzone zmiany.
*/
(function () {
  'use strict';
  var updater = window.SISU23OnlineUpdate;
  if (!updater || typeof updater.apply !== 'function') return;
  updater.apply({
    version: '2026.11.05.1',
    infoNote: 'SISU23 • Aktualizacje online aktywne',
    css: '.sisu-online-note{font-size:14px;color:#cdb58b;letter-spacing:.05em;margin-top:14px;}'
  });
})();
