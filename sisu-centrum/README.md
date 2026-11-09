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
## Centralne aktualizacje SISU23 TV (od wersji 0.1.14 / TV 0.7.1)

- W panelu administratora zakładka **Aktualizacje TV**: podgląd, zapis szkicu, publikacja, historia (12 wersji) i cofnięcie.
- Publikowane dane są wyłącznie deklaratywne: teksty, kolory, pliki JPG/PNG/WEBP/MP3, warianty apartamentów. Bez pobierania ani uruchamiania zdalnego JavaScript.
- GET /api/tv/content: bezpieczny widok ogólny; po uwierzytelnieniu sparowanego TV dane dotyczą tylko jego apartamentu. CORS dla telewizorów.
- GET /api/tv/content/assets: media przesłane przez administratora (do 12 MB), bezpieczne typy MIME, nazwa oparta na hash pliku.
- GET /api/tvs/content i POST /api/tvs/content/draft, /publish, /rollback, /assets: tylko administrator panelu SISU; zapis wymaga tokenu CSRF.
- Dane przechowywane w /data/sisu-tv-content.json, media w /data/sisu-tv-assets. Cofnięcie tworzy nowy numer wersji.
- Aplikacja Tizen 0.7.1 sprawdza publikacje przy uruchomieniu i co 5 minut, zapamiętuje ostatni poprawny zestaw w localStorage.
- Bez internetu zachowuje zapisany zestaw oraz oryginalne nagranie Asi wewnątrz pakietu.
- Zmiany kodu, nawigacji lub uprawnień Tizena nadal wymagają podpisanego pliku .wgt.

## Nagranie powitalne 5 listopada 2026 (v0.1.15)

- Dodano nowego lektora Alex jako uniwersalne powitanie SISU23 (MP3 32,84 s).
- Bez zmiany aplikacji Tizen: weryfikacja SHA-256, kopiowanie do /data/sisu-tv-assets, jednorazowe opublikowanie w systemie treści.
- Migracja jest idempotentna: wykonuje się wyłącznie, jeśli wersja treści wynosi 1 i nadal opublikowane jest oryginalne nagranie; wszystkie późniejsze publikacje administratora mają pierwszeństwo.
- Poprzednia wersja jest w historii publikacji i można ją przywrócić z panelu; nagranie oryginalne pozostaje w aplikacji jako fallback.


## Komunikaty głosowe i zatrzymanie nagłośnienia holu (v0.1.17)

W panelu **Muzyka holu** manager i administrator mogą wpisać komunikat (do 650 znaków), wybrać polski głos kobiecy lub męski, przygotować nagranie i odsłuchać je prywatnie na komputerze. Nadanie w holu jest osobną czynnością z potwierdzeniem; zmiana tekstu lub głosu unieważnia podgląd. Podgląd jest udostępniany przez serwer SISU wyłącznie zalogowanemu autorowi przez 10 minut, bez ujawniania tokenu HA.

Przycisk **Zatrzymaj odtwarzanie muzyki w holu** wywołuje `media_player.media_stop` na `media_player.smart_audio_player_2`. Automatyzacja radia (kontrola co 15 minut) nadal może wznowić muzykę; przycisk nie wyłącza harmonogramu.

Wymaga dostępnego `tts.home_assistant_cloud` (konfigurowalne przez `SISU_TTS_ENGINE`) z polskimi głosami oraz obsługi TTS przez odtwarzacz holu. Przed produkcyjnym użyciem sprawdzić na miejscu nazwy obsługiwanych głosów, `/api/tts_get_url`, odtwarzanie MP3 w przeglądarce i usługę `tts.speak` na głośniku holu. Wdrożenie wymaga aktualizacji dodatku HA SISU Centrum; aktualizacja samego repozytorium nie zmienia bieżącej instalacji.
