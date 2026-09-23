# Urodzinowe wyzwania — design E ("Tort w stylu biegowym")

Referencja designu do implementacji. Pliki `desktop.html`, `mobile.html`, `mobile-meta.html`
to źródła artboardów z canvasu (format Design Component: markup w `<x-dc>`, style inline,
logika w `class Component extends DCLogic`). **Nie uruchamiaj ich bezpośrednio** — traktuj je
jako specyfikację wyglądu: każdy element ma pełny styl inline, więc wartości (kolory, rozmiary,
paddingi, cienie) można przenieść 1:1.

## Koncepcja

- Strona z listą zadań ("kopert") — głównie sportowych (bieganie, siłownia).
- Wykonanie zadania odblokowuje następne. Wykonanie wszystkich odsłania główną nagrodę ("prezent").
- Postęp pokazuje **tort ze świeczkami**: każde zaliczone zadanie zapala świeczkę
  (tryb alternatywny: wszystkie płoną na starcie i zadania je gaszą).
- Wiek jubilata jest wypisany na środkowej warstwie tortu.

## Tokeny

| Token | Wartość |
|---|---|
| tło strony | `#f4ecdc` (krem) |
| tekst / obrysy | `#141210` (czerń) |
| akcent 1 (malina) | `#c81e5a`, hover `#9c1546` |
| akcent 2 (żółć) | `#ffd23f` |
| tekst drugorzędny | `#4a453c`, wyciszony `#6b655a`, zablokowany `#a39c8c` |
| karta | `#ffffff` |
| karta zablokowana | `#ede3cf`, klapa koperty `#e2d6be` |
| obrys kart | `3px solid #141210` (zablokowane: `3px dashed #a39c8c`) |
| radius | karty 12–14px (desktop 16px), pigułki 999px, przyciski 10px |
| twardy cień | aktywna karta `6px 6px 0 #c81e5a` (desktop 8px), prezent/tort `6px 6px 0 #141210` |

Fonty (Google Fonts): **Anton** (nagłówki, tytuły zadań, liczby; uppercase, letter-spacing 1–3px)
+ **Space Grotesk** 400/500/700 (tekst, etykiety; etykiety uppercase, letter-spacing 2px, 11–13px).

## Układ

- **Mobile (390px):** jedna kolumna, padding 20px. Kolejność: top bar → tort → pigułka
  "Zapalone: x / 6" → nagłówek "Sto lat, [IMIĘ]! Zanim zdmuchniesz…" + lead → lista kopert →
  karta prezentu → stopka "[OD KOGO]".
- **Desktop (≥1280px):** grid `520px 1fr`, gap 72px, padding boczny 72px. Lewa kolumna: tort,
  nagłówek (68px), karta prezentu, stopka. Prawa: nagłówek "Koperty · x/6 zaliczone" z dolną
  linią 3px + lista kopert.

## Komponenty i stany

**Tort** — 6 świeczek (pasiaste biało-malinowe, obrys 2px, knot czarny) nad trzema warstwami:
żółta (radius góra 12–14px), malinowa z wiekiem (Anton 44/60px, kolor `#f4ecdc`),
biała z czarnymi "kropelkami" na dole (repeating-linear-gradient), czarna podstawa z twardym cieniem.
Płomień zapalony: żółta łezka z obrysem + poświata `0 0 0 4px rgba(255,210,63,.35), 0 0 16px rgba(255,150,30,.6)`.
Niezapalona: mała kropkowana kółeczko `#a39c8c`.

**Koperta — zaliczona:** biała karta, czarny obrys; po lewej czarne kółko 40px z żółtym checkiem;
etykieta "KOPERTA n · ZALICZONA" (`#6b655a`); tytuł Anton 24px przekreślony maliną (3px).

**Koperta — aktywna (otwarta):** biała karta z malinowym twardym cieniem; żółta pigułka
"KOPERTA n · OTWARTA"; ikona hantli po prawej; tytuł Anton 36/40px; opis 15–16px `#4a453c`;
przycisk 52px czarny z żółtym tekstem "ZROBIONE — ZAPAL ŚWIECZKĘ" (mobile: pełna szerokość,
desktop: auto). Tylko jedna koperta jest aktywna naraz.

**Koperta — zaklejona:** tło `#ede3cf`, kreskowany obrys, trójkątna klapa `#e2d6be` (clip-path),
malinowa pieczęć 40px z kłódką i czarnym obrysem; etykieta "KOPERTA n · ZAKLEJONA";
tytuł zastąpiony przez "??? ??? ???" w `#a39c8c`.

**Prezent — zablokowany:** biała karta z malinową "wstążką" (pasy 14–16px z czarnymi
krawędziami przez środek pionowo i poziomo), kółko z kłódką, "PREZENT GŁÓWNY",
"Jeszcze N koperty", "Wstążka puści, gdy tort będzie gotowy."

**Prezent — odblokowany:** żółta karta, czarny obrys, twardy czarny cień, ikona prezentu,
"TORT GOTOWY · PREZENT ROZPAKOWANY", nazwa nagrody Anton 40/44px, opis, przycisk "OD NOWA".

## Logika (do zaimplementowania)

- `done` = liczba zaliczonych zadań (0…N). Zadanie `i`: done gdy `i < done`, aktywne gdy `i === done`,
  zablokowane gdy `i > done`. Nagroda gdy `done === N`.
- Świeczki: tryb "zapalane" → świeczka `i` płonie gdy `i < done`; tryb "zdmuchiwane" → gdy `i >= done`.
- Do ustalenia w implementacji: sposób zaliczania (przycisk vs kod/hasło do koperty) i zapis postępu
  (np. `localStorage`).

## Miejsca do uzupełnienia

`[IMIĘ]`, `[WIEK]`, `[NAGRODA GŁÓWNA]`, `[Krótki opis nagrody lub gdzie ją odebrać]`, `[OD KOGO]`,
data w top barze (obecnie 23.09), treści 6 zadań (przykładowe w `tasks()` w plikach).
