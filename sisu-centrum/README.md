# SISU Centrum Zarządzania (lokalna aplikacja HA)

Oddzielny panel WWW hostowany na tym samym serwerze co Home Assistant, port 8098.
Administrator i managerowie mają **osobne konta tylko w SISU**. Goście nie mają kont.
Aplikacja komunikuje się z Home Assistant wyłącznie po wewnętrznym API Supervisor
(`homeassistant_api: true`). Token jest dostępny tylko kontenerowi, a nie przeglądarce.

## Pierwsze uruchomienie
1. Zainstaluj aplikację w HA: Ustawienia -> Aplikacje -> Instaluj, a następnie otwórz jej dziennik.
2. W logach pojawi się unikalny jednorazowy kod uruchomieniowy (24 cyfry szesnastkowe).
3. Otwórz `http://ADRES_IP_SERWERA_HA:8098/` w lokalnej sieci.
4. Wpisz kod uruchomieniowy, e-mail właściciela i silne hasło. Kod przestanie działać.
5. W sekcji „Personel” możesz tworzyć/usuwać konta managerów; hasło tymczasowe jest pokazane tylko raz.

**Ważne:** korzystaj lokalnie. Przed dostępem z internetu skonfiguruj **HTTPS z uwierzytelnionym tunelem lub reverse proxy**. Nie przekierowuj surowego portu 8098 na routerze. Menedżerowie nie otrzymują kont HA. Managerowie mają wyłącznie dozwolone akcje na urządzeniach lokali i zmianę statusów, weryfikowane po stronie serwera. Pozostałe lokale dołącza się po instalacji urządzeń.

Stan HA pozostaje bez zmian podczas instalowania aplikacji.

## Telewizory SISU23 (od wersji 0.1.12)

* Administrator: zakładka **Telewizory** — oczekujące kody, przypisania 30 apartamentów, ostatni kontakt, wersja aplikacji, zmiana lokalu i odłączanie.
* Aplikacja Samsung pokazuje jednorazowy 8-cyfrowy kod; administrator przypisuje lokal w panelu; telewizor otrzymuje 256-bitowy losowy token.
* Serwer przechowuje tylko skrót SHA-256 tokenu oraz zapisany numer lokalu (`/data/sisu-tvs.json`). Odłączenie unieważnia token.
* Tryb `demo` dla domowego testu nie steruje żadnymi urządzeniami. Tryb `room` wyznacza właściwy lokal, ale komendy dla urządzeń pozostają wyłączone, dopóki nie skonfigurujemy ścisłych serwerowych map encji Home Assistant i autoryzacji.
* Połączenie aplikacji z serwerem wymaga HTTPS (SISU Funnel). Endpointy TV nigdy nie udostępniają tokenu administratora ani innych pokojów.
* Instalacja modułu nie modyfikuje stanów Home Assistanta ani istniejących kont personelu.