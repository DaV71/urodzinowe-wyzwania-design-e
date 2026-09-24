# Urodzinowe wyzwania

Prezent urodzinowy w formie aplikacji webowej dla jednej osoby: 28 zadań sportowych w 4 etapach po 7, schowanych w kopertach.
Koperty otwierają się po kolei, każde zaliczone zadanie zapala świeczkę na torcie, a po 28. odblokowuje się nagroda główna.
Zadanie zalicza Dawid: zatwierdza zgłoszenie w panelu albo podaje jednorazowy kod. Postęp jest zapisany tylko na serwerze.
Stos: Next.js 16, Prisma 7, Postgres 16, Docker. Specyfikacja: `docs/superpowers/specs/2026-09-23-urodzinowe-wyzwania-design.md`.

## Jak to działa

1. Jubilat(ka) wchodzi raz przez sekretny link `https://<domena>/start/<PLAYER_TOKEN>`. Link zapisuje cookie na 120 dni,
   później wystarczy sam adres. Bez cookie strona pokazuje tylko zaklejoną kopertę.
2. Otwarta jest zawsze jedna koperta. Treść kolejnych nie trafia do przeglądarki, dopóki się nie otworzą.
3. Jubilat klika „Zrobione — zapal świeczkę”, dołącza dowód (zdjęcie lub screenshot, do 4 plików) i, jeśli zadanie tego wymaga,
   dystans i czas. Koperta przechodzi w stan „czeka na Dawida”.
4. Aplikacja nie wysyła powiadomień. Dawid sam zagląda do `/admin` (liczba oczekujących zgłoszeń jest w tytule karty)
   i zatwierdza albo odrzuca zgłoszenie z podaniem powodu. Po zatwierdzeniu świeczka się zapala i otwiera się następna koperta.
5. Zamiast zgłoszenia można wpisać w kopercie kod `XXXX-XXXX` od Dawida (np. przy wspólnym biegu). Kod zalicza zadanie od razu.

## Dev lokalny

Wymagania: Node ≥ 22.12, Docker (tylko dla lokalnego Postgresa).

```bash
cp .env.example .env     # NAJPIERW: postinstall (prisma generate) potrzebuje DATABASE_URL
npm install
npm run db:up            # Postgres 16 w Dockerze (docker-compose.dev.yml)
npm run db:migrate       # migracje
npm run db:seed          # 28 zadań z prisma/seed-data/tasks.json
npm run dev              # http://localhost:3000
```

- Port bazy ustawia `DEV_DB_PORT` w `.env` (w `.env.example`: 55432). Jeśli port jest zajęty, zmień `DEV_DB_PORT`
  i port w `DATABASE_URL` na tę samą wartość, potem `npm run db:up`.
- Wejście jako jubilat: `http://localhost:3000/start/<PLAYER_TOKEN z .env>`. Panel: `http://localhost:3000/admin`
  (hasło `ADMIN_PASSWORD` z `.env`).
- **Uwaga:** `npm run check` uruchamia testy integracyjne na bazie z `DATABASE_URL`. Czyszczą one tabele postępu
  (`TaskProgress`, `Submission`, `CodeAttempt`, `AuditLog`). Lokalny postęp po testach znika, a zadania zostają.

## Personalizacja

Imię, wiek, nagrodę, jej opis, podpis „od kogo”, datę i nazwy etapów ustawiasz w `src/config/site.ts`. To nie są sekrety,
plik jest w repo. Wartości są wkompilowane w aplikację, więc po zmianie trzeba ją zdeployować ponownie (`bash scripts/deploy.sh`).

## Treść zadań

Zadania są w `prisma/seed-data/tasks.json`: dokładnie 28 pozycji z tytułem, opisem, rodzajem dowodu, podpowiedzią i progami
dystansu i czasu. Po edycji wystarczy `bash scripts/deploy.sh`. Kontener przy każdym starcie wykonuje seed jako upsert,
więc treść się aktualizuje, a postęp i zgłoszenia zostają. Lokalnie: `npm run db:seed`.

## Deploy

Wymagania:

- VPS ze wspólnym proxy (caddy-docker-proxy w sieci `web`) i wgranym certyfikatem wildcard. Jednorazowy setup serwera
  opisuje `demo-deploy.md`.
- Subdomena objęta wildcardem (np. `urodziny.twojadomena.pl`) z rekordem DNS wskazującym na serwer.
- Dostęp SSH jako root albo użytkownik z sudo bez hasła. Docker i git zainstaluje deploy, jeśli ich brakuje.
- Prywatne repo: `GIT_TOKEN` w `deploy.conf` i git ≥ 2.31 na serwerze.

```bash
cp deploy.conf.example deploy.conf     # uzupełnij SERVER_HOST, SSH_USER, APP_DOMAIN, REPO_URL (plik jest poza gitem)
bash scripts/deploy.sh --dry-run       # podgląd skryptu zdalnego, bez łączenia z serwerem
bash scripts/deploy.sh                 # deploy albo redeploy (idempotentny), czeka na https://<domena>/api/health
```

Przy pierwszym deployu serwer losuje sekrety (`POSTGRES_PASSWORD`, `AUTH_SECRET`, `CODES_SECRET`, `PLAYER_TOKEN`,
`ADMIN_PASSWORD`) i zapisuje je w `~/urodzinowe/.env` (tryb 600). Kolejne deploye ich nie zmieniają. Deploy nie wypisuje
sekretów, tylko pokazuje, jak je odczytać:

```bash
ssh <user>@<host> "grep -E '^(ADMIN_PASSWORD|PLAYER_TOKEN)=' ~/urodzinowe/.env"
```

Pełny link startowy (z przyciskiem „kopiuj”) jest też w panelu admina.

Rotacja sekretu: wartość podajesz w zmiennej środowiskowej albo wpisujesz ją w ukrytym polu:

```bash
bash scripts/deploy.sh --set-secret PLAYER_TOKEN      # stary link przestaje działać, nowy jest w panelu
bash scripts/deploy.sh --set-secret ADMIN_PASSWORD
bash scripts/deploy.sh --set-secret CODES_SECRET      # unieważnia wydrukowane kody, trzeba je wydrukować ponownie
bash scripts/deploy.sh --set-secret AUTH_SECRET       # wylogowuje wszystkie sesje
```

`POSTGRES_PASSWORD` nie da się zmienić tą drogą, bo hasło istniejącej bazy wymaga `ALTER USER`. Inne opcje: `--config <plik>`,
`--no-wait` (`bash scripts/deploy.sh --help`).

## Panel admina (`/admin`)

Logowanie hasłem `ADMIN_PASSWORD`, sesja trwa 30 dni. Panel działa też na telefonie. Kolejność sekcji na stronie:

- **Do zatwierdzenia**: zgłoszenia ze zdjęciami, dystansem i czasem oraz żółtymi ostrzeżeniami (np. zgłoszenie chwilę po
  odblokowaniu, to samo zdjęcie co w innym zadaniu, wartość poniżej progu). Przyciski „Zatwierdź” i „Odrzuć” (odrzucenie
  wymaga powodu).
- **Tablica 28 zadań** ze statusem i wynikiem oraz przyciskiem „Cofnij ostatnie zaliczenie”.
- **Link startowy** z przyciskiem kopiuj.
- **Kody kopert**: 28 kodów. Aby je wydrukować, użyj Ctrl+P (na telefonie Udostępnij → Drukuj). Na wydruku są tylko kody.
- **Strefa niebezpieczna**: „Resetuj postęp” (wymaga wpisania `RESET`).
- Ostatnie wpisy audytu i przycisk „Wyloguj”.

## Backup i restore

```bash
bash scripts/backup.sh --dry-run   # podgląd komend zdalnych
bash scripts/backup.sh             # backups/db-<ts>.dump + backups/uploads-<ts>.tgz na tym komputerze
```

Skrypt korzysta z `deploy.conf` (lub `--config <plik>`). Bazę zrzuca przez `pg_dump -Fc` w kontenerze `db`, a zdjęcia
pakuje z wolumenu `urodzinowe_uploads`. Pliki trafiają na dysk dopiero wtedy, gdy oba zrzuty się udały. Katalog `backups/` jest poza gitem.
Komendy restore (`pg_restore --clean` do kontenera `db`, `tar xzf` do wolumenu) są w komentarzu na początku
`scripts/backup.sh`.

## Testy

```bash
npm run check                 # tsc + vitest (z testami integracyjnymi, które czyszczą postęp w bazie dev, patrz wyżej)
bash tests/deploy-lib.test.sh # deploy/backup: generatory skryptów, dry-run, atrapa ssh (bez sieci i serwera)
bash tests/docker-smoke.sh    # build obrazu + start stacku produkcyjnego w izolowanym projekcie compose
```

## Checklista przed urodzinami

1. Uzupełnij `src/config/site.ts` (imię, wiek, nagroda, od kogo, data) i sprawdź treść w `prisma/seed-data/tasks.json`.
2. `bash scripts/deploy.sh`, a potem odczytaj `ADMIN_PASSWORD` (komenda wyżej) i zaloguj się na `https://<domena>/admin`.
3. Test z telefonu: wejdź linkiem startowym z panelu, zgłoś zadanie 1 ze zdjęciem, zatwierdź je w `/admin`,
   a na koniec kliknij „Resetuj postęp”.
4. Wydrukuj kody z panelu (Ctrl+P) i schowaj je.
5. Zrób pierwszy backup: `bash scripts/backup.sh`.
6. Przekaż jubilatowi link startowy i zaglądaj do `/admin` (licznik oczekujących jest w tytule karty).
