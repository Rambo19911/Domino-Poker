import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesPl: MpRulesDoc = {
  intro: [
    "Ta gra jest bardzo dynamiczna i wymaga dobrej znajomości zasad, aby móc podejmować decyzje w krótkim czasie. Do treningu zalecany jest tryb dla jednego gracza.",
    "Domino Poker w trybie wieloosobowym to gra w czasie rzeczywistym przy stole z czterema miejscami. W każdej rozgrywce używa się standardowego zestawu domino podwójnej szóstki z 28 kostkami, rozdawanych po 7 kostek na każde miejsce. Grać może czterech ludzi albo mieszanka ludzi i botów. Rozgrywka może się rozpocząć dopiero wtedy, gdy wszystkie cztery miejsca są zajęte i przynajmniej jedno zajmuje człowiek."
  ],
  sections: [
    {
      title: "Pokoje publiczne i prywatne",
      blocks: [
        "Gracze mogą utworzyć pokój publiczny lub prywatny.",
        "Pokoje publiczne są przeznaczone do odnajdywania z lobby. Inni gracze mogą je znaleźć na liście pokojów, otworzyć widok pokoju, wybrać wolne miejsce i dołączyć, dopóki pokój wciąż oczekuje na start.",
        "Pokoje prywatne są przeznaczone dla zaproszonych graczy. Mają normalny stan pokoju i miejsca, ale dołączenie do pokoju prywatnego wymaga kodu pokoju. Do pokoju prywatnego nie można dołączyć po prostu używając jego identyfikatora z procesu publicznego lobby. Kod pokoju jest pokazywany w widoku pokoju i należy go udostępniać tylko graczom, których chcesz zaprosić.",
        "Zarówno pokoje publiczne, jak i prywatne obsługują te same zasady gry, ten sam system miejsc, tę samą opcję dopełniania botami i ten sam przebieg rozgrywki. Różnica polega na odnajdywalności i dostępie do dołączenia: do pokojów publicznych można dołączyć z lobby; pokoje prywatne wymagają kodu."
      ]
    },
    {
      title: "Miejsca w pokoju i sterowanie gospodarza",
      blocks: [
        "Każdy pokój ma dokładnie cztery miejsca. Gracz, który tworzy pokój, zostaje gospodarzem i zajmuje pierwsze miejsce. Inni gracze mogą zajmować dostępne miejsca, dopóki pokój oczekuje.",
        "Gospodarz może dopełnić wolne miejsca botami. Pozwala to rozpocząć grę nawet wtedy, gdy dostępnych jest mniej niż czterech ludzi. Gospodarz jest też jedynym graczem, który może rozpocząć grę.",
        "Gra nie może się rozpocząć, jeśli któreś miejsce wciąż jest puste. Jeśli gospodarz spróbuje rozpocząć za wcześnie, serwer odrzuca start. Praktyczna zasada jest prosta: wymagane są cztery zajęte miejsca, ludźmi lub botami.",
        "Jeśli gospodarz odejdzie, gdy pokój wciąż oczekuje, rola gospodarza przechodzi na innego pozostałego gracza-człowieka. Jeśli w oczekującym pokoju nie zostanie żaden człowiek, pokój zostaje zniszczony."
      ]
    },
    {
      title: "Złote monety i pokoje płatne",
      blocks: [
        "Pokoje mogą być darmowe lub płatne. Tworząc pokój, zalogowany gospodarz może ustawić wpisowe w złocie — dowolną kwotę do wysokości własnego stanu (0 oznacza pokój darmowy, który działa dokładnie jak wcześniej).",
        "Miejsce w pokoju płatnym mogą zająć tylko zarejestrowani, zalogowani gracze: mają oni stan złota. Gracze anonimowi nie mają portfela, więc nie mogą dołączać do pokojów płatnych, ale wciąż mogą dołączać do pokojów darmowych.",
        "Każdy gracz płaci wpisowe w chwili zajęcia miejsca, łącznie z gospodarzem. Miejsce można zająć tylko wtedy, gdy stan pokrywa wpisowe. Zebrane opłaty tworzą pulę nagród pokoju.",
        "Przed rozpoczęciem gry pieniądze są w pełni zwrotne. Jeśli opuścisz swoje miejsce, gdy pokój wciąż oczekuje, gospodarz usunie oczekujący pokój lub pokój wygaśnie przed startem, Twoje wpisowe zostanie zwrócone na Twój stan.",
        "Po rozpoczęciu gry wpisowe nie podlega już zwrotowi. Opuszczenie, rezygnacja lub rozłączenie podczas rozgrywki nie zwraca Twojej opłaty — pozostaje ona w puli dla zwycięzców.",
        "Gdy rozgrywka się kończy, pula jest dzielona między dwóch najlepszych zarejestrowanych graczy-ludzi według łącznego wyniku: 70% dla pierwszego miejsca i 30% dla drugiego. Boty nigdy nie otrzymują udziału, a gracze, którzy zrezygnowali, są wykluczeni. Jeśli pozostanie tylko jeden zarejestrowany człowiek, ten gracz zgarnia całą pulę.",
        "Jeśli wszyscy ludzie odejdą i rozgrywka zostanie porzucona bez ukończenia, nie ma zwycięzcy, więc pula nie jest wypłacana.",
        "Stan, który widzisz, aktualizuje się na żywo, gdy płacisz, otrzymujesz zwrot lub wygrywasz pulę. Serwer jest zawsze autorytetem w sprawie każdego ruchu monet."
      ]
    },
    {
      title: "Jeden pokój naraz",
      blocks: [
        "Gracz może przebywać tylko w jednym pokoju naraz. Jeśli gracz już utworzył pokój lub do niego dołączył, serwer odrzuci próby utworzenia kolejnego pokoju lub dołączenia do innego, dopóki ten gracz nie opuści bieżącego pokoju, nie zrezygnuje z aktywnej gry albo gra się nie zakończy i pokój nie zostanie posprzątany.",
        "Zapobiega to zajmowaniu miejsc w wielu pokojach naraz przez jedną tożsamość przeglądarki.",
        "Do testów lokalnych z wieloma graczami-ludźmi na jednej maszynie każdy gracz potrzebuje osobnej tożsamości przeglądarki, na przykład różnych przeglądarek lub okien incognito/prywatnych."
      ]
    },
    {
      title: "Czas życia pokoju i TTL",
      blocks: [
        "Pokoje mają czas życia (TTL) wynoszący 1 godzinę od utworzenia.",
        "Pokoje oczekujące, rozpoczynające się, zakończone lub zniszczone są sprzątane po upływie ich TTL. Sprzątanie odbywa się okresowo, więc usunięcie może nastąpić wkrótce po dokładnym czasie wygaśnięcia, a nie co do milisekundy.",
        "Aktywne pokoje w trakcie gry nie są niszczone tylko dlatego, że minął pierwotny TTL. Jeśli rozgrywka już trwa, pokojowi pozwala się ją dokończyć. Po zakończeniu gry serwer dostarcza końcowy wynik, a następnie niszczy pokój, aby gracze mogli swobodnie utworzyć inny pokój lub do niego dołączyć.",
        "Jeśli wszyscy gracze-ludzie rozłączą się z aktywnej gry, serwer daje krótki okres karencji na ponowne połączenie. Jeśli w tym czasie żaden człowiek nie wróci, porzucony pokój zostaje zniszczony."
      ]
    },
    {
      title: "Rozpoczęcie gry",
      blocks: [
        "Gdy gospodarz rozpoczyna pełny pokój, serwer tworzy autorytatywny stan gry i wysyła każdemu zasiadającemu graczowi-człowiekowi jego własny, osobisty zrzut gry. Każdy gracz otrzymuje tylko własną rękę. Ukryte kostki przeciwników nigdy nie są wysyłane innym graczom.",
        "Po wejściu pokoju do gry następuje 10-sekundowe odliczanie przed pierwszą turą licytacji. Daje to graczom czas na załadowanie stołu, zanim ruszy właściwy licznik tury.",
        "To odliczanie przed grą jest oddzielne od 10-sekundowego licznika na każdą turę."
      ]
    },
    {
      title: "10-sekundowy licznik tury",
      blocks: [
        "Każda licytacja lub ruch gracza-człowieka ma własny 10-sekundowy licznik kontrolowany przez serwer.",
        "Licznik startuje dopiero wtedy, gdy faktycznie nadchodzi tura danego gracza-człowieka. Jeśli przed kolejnym człowiekiem muszą zagrać boty, serwer najpierw rozgrywa boty z krótkim opóźnieniem tempa i dopiero potem uruchamia 10-sekundowe odliczanie gracza-człowieka. Oznacza to, że gracz-człowiek nie traci czasu, czekając na animacje botów lub rozstrzygnięcie tur botów.",
        "Serwer jest autorytetem w sprawie czasu. Klient wyświetla odliczanie, ale to serwer decyduje, czy akcja dotarła przed terminem.",
        "Jeśli gracz prześle licytację lub ruch przed terminem, akcja jest weryfikowana i przyjmowana tylko wtedy, gdy jest zgodna z zasadami.",
        "Jeśli akcja dotrze po terminie, serwer odrzuca ją jako spóźnioną.",
        "Jeśli licznik się skończy, a gracz nie zagrał, serwer automatycznie rozstrzyga turę, aby gra nigdy się nie zatrzymała:",
        {
          list: [
            "Podczas licytacji spóźniona licytacja zostaje wymuszona na bezpieczną, zgodną z zasadami wartość, zwykle 0.",
            "Podczas rozgrywania kostek serwer wybiera i zagrywa zgodny z zasadami ruch za tego gracza.",
            "Jeśli spóźniony ruch kończy lewę, serwer rozstrzyga zwycięzcę lewy i posuwa grę naprzód."
          ]
        },
        "Powtarzające się pominięte tury wpływają na status nieaktywności gracza. Po pierwszej pominiętej turze gracz zostaje oznaczony stanem ostrzeżenia. Po drugiej jest uznawany za nieaktywnego. Po trzeciej dla tego gracza włącza się gra automatyczna. Powracający gracz może wznowić grę i wyłączyć tryb automatyczny, aby odzyskać ręczną kontrolę."
      ]
    },
    {
      title: "Rozłączenia i ponowne połączenia",
      blocks: [
        "Jeśli gracz rozłączy się podczas gry, jego miejsce nie jest natychmiast usuwane. Gra trwa dalej, a jego przyszłe tury mogą być obsługiwane przez system limitu czasu, jeśli nie wróci na czas.",
        "Gdy gracz ponownie połączy się z tą samą tożsamością przeglądarki i tokenem ponownego połączenia, serwer przywraca jego pokój, miejsce, stan połączenia i wysyła świeży osobisty zrzut. Ten zrzut obejmuje bieżący stan gry oraz, jeśli tura jest aktywna, bieżący termin tury.",
        "Jeśli gracz celowo odejdzie podczas aktywnej gry, jest to traktowane jako rezygnacja. Jego miejsce staje się miejscem bota, gracz wraca do lobby i nie może ponownie zająć tego samego miejsca. Pozostali gracze kontynuują rozgrywkę."
      ]
    },
    {
      title: "Licytacja i rozgrywka",
      blocks: [
        "Każda runda zaczyna się od licytacji. Każdy gracz licytuje raz, wybierając, ile z 7 lew spodziewa się wygrać. Prawidłowe deklaracje to od 0 do 7.",
        "Po złożeniu wszystkich deklaracji zaczyna się faza rozgrywki. Gracze zagrywają jedną kostkę domino na lewę. Zwycięzca każdej lewy wychodzi do następnej lewy.",
        "Serwer weryfikuje każdy ruch. Klient może dla wygody podświetlać możliwe ruchy, ale to nie klient decyduje, co jest zgodne z zasadami. Serwer odrzuca ruchy niezgodne z zasadami, ruchy niewłaściwego gracza, nieaktualne identyfikatory tur i spóźnione akcje."
      ]
    },
    {
      title: "Zasady kostek",
      blocks: [
        "Atuty to najsilniejsza grupa kostek. Od najsilniejszej do najsłabszej kolejność atutów to:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Asy to:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Kostka 0-6 ma specjalną podwójną rolę. Jeśli jest zagrana lub wymagana jako 0, zachowuje się jak as. Jeśli jest zadeklarowana jako 6, zachowuje się jak zwykła kostka szóstki.",
        "Wychodząc do lewy, gracz może wyjść dowolną kostką. Jeśli wyłożona kostka nie jest atutem ani dubletem, a ma dwie różne liczby, gracz musi zadeklarować, która liczba jest wymagana.",
        "Dorzucając do lewy:",
        {
          list: [
            "Jeśli wyszedł atut, gracze muszą zagrać atut, jeśli go mają. Jeśli mają atut silniejszy niż najsilniejszy atut już w lewie, muszą zagrać silniejszy atut.",
            "Jeśli wymagana była liczba, gracze muszą dorzucić tę liczbę kostką nieatutową, o ile to możliwe.",
            "Jeśli nie mogą dorzucić wymaganej liczby, muszą zagrać atut, jeśli go mają.",
            "Jeśli nie mogą dorzucić i nie mają atutu, mogą zrzucić dowolną kostkę."
          ]
        }
      ]
    },
    {
      title: "Punktacja",
      blocks: [
        "Po 7 lewach runda jest punktowana przez porównanie deklaracji każdego gracza z liczbą faktycznie wygranych przez niego lew.",
        {
          list: [
            "Dokładna deklaracja: 15 punktów za każdą zadeklarowaną lewę.",
            "Dokładna deklaracja 7: 105 punktów plus 50-punktowa premia.",
            "Więcej lew niż zadeklarowano: 5 punktów za każdą wygraną lewę.",
            "Mniej lew niż zadeklarowano: -5 punktów za każdą brakującą lewę.",
            "Nieudana deklaracja 7: -50 punktów."
          ]
        },
        "Punkty rundy są dodawane do sumy rozgrywki. Po skonfigurowanej liczbie rund wygrywa gracz z najwyższym łącznym wynikiem. W razie potrzeby gra stosuje kryteria rozstrzygające remisy na podstawie wyniku, deklaracji, wygranych lew i kolejności miejsc od rozdającego."
      ]
    },
    {
      title: "Prywatność i uczciwość",
      blocks: [
        "Serwer gry wieloosobowej jest autorytatywny. Należy do niego potasowana talia, stan gry, terminy licznika, weryfikacja zgodnych z zasadami ruchów, punktacja i przebieg rund.",
        "Każdy gracz otrzymuje tylko własną rękę. Ukryte kostki innych graczy nie są zawarte w ich zrzutach. Informacje publiczne obejmują deklaracje, wygrane lewy, łączne wyniki, bieżącą lewę, ukończone lewy, statusy graczy oraz liczbę pozostałych kostek każdego gracza.",
        "Rozdanie w grze wieloosobowej jest generowane z ziarna po stronie serwera. Dzięki temu rozgrywki są odtwarzalne z ziarna i historii zdarzeń, co pomaga w kontroli uczciwości, powtórkach, debugowaniu i odzyskiwaniu."
      ]
    },
    {
      title: "Statystyki",
      blocks: [
        "Statystyki liczą się wyłącznie z gier wieloosobowych, w których wszystkie cztery miejsca zajmuje czterech różnych zarejestrowanych (zalogowanych) graczy."
      ]
    }
  ]
};
