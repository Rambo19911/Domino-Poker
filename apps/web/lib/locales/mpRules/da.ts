import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesDa: MpRulesDoc = {
  intro: [
    "Dette spil er meget dynamisk og kræver en god forståelse af spillets regler for at kunne træffe beslutninger på kort tid. Til træning anbefales det at spille enkeltspiller-tilstand.",
    "Domino Poker multiplayer er et bord-spil i realtid med fire pladser. Hvert parti bruger et standard dobbelt-seks dominosæt med 28 brikker, der deles ud som 7 brikker til hver plads. Spillet kan spilles af fire menneskelige spillere eller af en blanding af mennesker og bots. Et parti kan kun starte, når alle fire pladser er fyldt, og mindst én plads er besat af en menneskelig spiller."
  ],
  sections: [
    {
      title: "Offentlige og private rum",
      blocks: [
        "Spillere kan oprette enten et offentligt eller et privat rum.",
        "Offentlige rum er beregnet til at kunne findes fra lobbyen. Andre spillere kan finde dem i rumlisten, åbne rumvisningen, vælge en tom plads og tilslutte sig, mens rummet stadig venter på at starte.",
        "Private rum er beregnet til inviterede spillere. De har stadig normal rumtilstand og pladser, men at tilslutte sig et privat rum kræver rumkoden. Et privat rum kan ikke tilsluttes blot ved at bruge dets rum-id fra det offentlige lobbyforløb. Rumkoden vises i rumvisningen og bør kun deles med de spillere, du vil invitere.",
        "Både offentlige og private rum understøtter de samme spilleregler, det samme pladssystem, den samme bot-udfyldningsmulighed og det samme partiforløb. Forskellen er, hvor de kan findes, og hvordan man tilslutter sig: offentlige rum kan tilsluttes fra lobbyen; private rum kræver koden."
      ]
    },
    {
      title: "Rumpladser og værtskontroller",
      blocks: [
        "Hvert rum har præcis fire pladser. Spilleren, der opretter rummet, bliver vært og placeres på den første plads. Andre spillere kan tilslutte sig ledige pladser, mens rummet venter.",
        "Værten kan fylde tomme pladser med bots. Dette gør det muligt at starte et spil, selv hvis der er færre end fire menneskelige spillere tilgængelige. Værten er også den eneste spiller, der kan starte spillet.",
        "Et spil kan ikke starte, hvis nogen plads stadig er tom. Hvis værten forsøger at starte for tidligt, afviser serveren starten. Den praktiske regel er enkel: der kræves fire besatte pladser, mennesker eller bots.",
        "Hvis værten forlader rummet, mens det stadig venter, overgår værtskabet til en anden tilbageværende menneskelig spiller. Hvis ingen menneskelige spillere er tilbage i et ventende rum, ødelægges rummet."
      ]
    },
    {
      title: "Guldmønter og betalingsrum",
      blocks: [
        "Rum kan være gratis eller betalt. Når et rum oprettes, kan en indlogget vært angive et deltagergebyr i guld — et hvilket som helst beløb op til deres egen beholdning (0 betyder et gratis rum, som opfører sig præcis som før).",
        "Kun registrerede, indloggede spillere kan tage en plads i et betalt rum: de har en guldbeholdning. Anonyme spillere har ingen tegnebog, så de kan ikke tilslutte sig betalte rum, men de kan stadig tilslutte sig gratis rum.",
        "Hver spiller betaler deltagergebyret i det øjeblik, de tager en plads, inklusive værten. En plads kan kun tages, hvis beholdningen dækker gebyret. De opkrævede gebyrer danner rummets præmiepulje.",
        "Før spillet starter, kan pengene fuldt ud refunderes. Hvis du forlader din plads, mens rummet stadig venter, værten sletter det ventende rum, eller rummet udløber før start, returneres dit deltagergebyr til din beholdning.",
        "Når spillet er startet, kan deltagergebyret ikke længere refunderes. At forlade, opgive eller miste forbindelsen under partiet returnerer ikke dit gebyr — det forbliver i puljen til vinderne.",
        "Når partiet slutter, deles puljen mellem de to bedste registrerede menneskelige spillere efter samlet score: 70% til førstepladsen og 30% til andenpladsen. Bots modtager aldrig en andel, og spillere, der har opgivet, er udelukket. Hvis kun ét registreret menneske er tilbage, tager den spiller hele puljen.",
        "Hvis alle mennesker forlader spillet, og partiet opgives uden at blive afsluttet, er der ingen vinder, så puljen udbetales ikke.",
        "Beholdningen, du ser, opdateres live, efterhånden som du betaler, får refusion eller vinder puljen. Serveren er altid autoriteten over enhver møntbevægelse."
      ]
    },
    {
      title: "Ét rum ad gangen",
      blocks: [
        "En spiller kan kun være i ét rum ad gangen. Hvis en spiller allerede har oprettet eller tilsluttet sig et rum, vil serveren afvise forsøg på at oprette et andet rum eller tilslutte sig et andet, indtil den spiller forlader det aktuelle rum, opgiver et aktivt spil, eller spillet slutter og rummet ryddes op.",
        "Dette forhindrer én browser-identitet i at optage pladser på tværs af flere rum på én gang.",
        "Til lokal test med flere menneskelige spillere på én maskine har hver spiller brug for en separat browser-identitet, såsom forskellige browsere eller inkognito-/private vinduer."
      ]
    },
    {
      title: "Rummets levetid og TTL",
      blocks: [
        "Rum har en levetid på 1 time fra oprettelsen.",
        "Ventende, startende, afsluttede eller ødelagte rum ryddes op, efter deres TTL er udløbet. Oprydningen kører periodisk, så fjernelsen kan ske kort efter det præcise udløbstidspunkt frem for på det nøjagtige millisekund.",
        "Aktive igangværende rum ødelægges ikke, bare fordi den oprindelige TTL udløber. Hvis et parti allerede er i gang, får rummet lov til at blive færdigt. Efter spillet slutter, leverer serveren det endelige spilresultat og ødelægger derefter rummet, så spillerne er frie til at oprette eller tilslutte sig et andet rum.",
        "Hvis alle menneskelige spillere mister forbindelsen til et aktivt spil, giver serveren en kort genoprettelsesperiode. Hvis intet menneske vender tilbage i løbet af den periode, ødelægges det forladte rum."
      ]
    },
    {
      title: "At starte spillet",
      blocks: [
        "Når værten starter et fuldt rum, opretter serveren den autoritative spiltilstand og sender hver siddende menneskelig spiller deres eget personlige spil-øjebliksbillede. Hver spiller modtager kun sin egen hånd. Modstandernes skjulte brikker sendes aldrig til andre spillere.",
        "Efter rummet går ind i spillet, er der en 10-sekunders nedtælling før spillet, før den første meldetur begynder. Dette giver spillerne tid til at indlæse bordet, før den rigtige turtimer starter.",
        "Denne nedtælling før spillet er adskilt fra den 10-sekunders timer pr. tur."
      ]
    },
    {
      title: "Den 10-sekunders turtimer",
      blocks: [
        "Hver menneskelig melding eller hvert træk har sin egen 10-sekunders server-styrede timer.",
        "Timeren starter kun, når det rent faktisk er den menneskelige spillers tur. Hvis bots skal handle før det næste menneske, spiller serveren bottene først med en kort tempoforsinkelse og starter først derefter den menneskelige spillers 10-sekunders nedtælling. Det betyder, at en menneskelig spiller ikke mister tid, mens han venter på bot-animationer eller bot-ture, der skal afvikles.",
        "Serveren er tidsautoriteten. Klienten viser nedtællingen, men serveren afgør, om en handling ankom før fristen.",
        "Hvis en spiller indsender en melding eller et træk før fristen, valideres handlingen og accepteres kun, hvis den er lovlig.",
        "Hvis handlingen ankommer efter fristen, afviser serveren den som for sen.",
        "Hvis timeren udløber, og spilleren ikke har handlet, afgør serveren automatisk turen, så spillet aldrig går i stå:",
        {
          list: [
            "Under melding tvinges timeout-meldingen til en sikker lovlig melding, normalt 0.",
            "Under spil af brikker vælger og spiller serveren et lovligt træk for den spiller.",
            "Hvis et stik fuldføres af timeout-trækket, afgør serveren stikvinderen og fører spillet videre."
          ]
        },
        "Gentagne forsømte ture påvirker spillerens inaktivitetsstatus. Efter den første forsømte tur markeres spilleren med en advarselstilstand. Efter den anden anses de for inaktive. Efter den tredje aktiveres auto-spil for den spiller. En tilbagevendende spiller kan genoptage og deaktivere auto-spil for at genvinde manuel kontrol."
      ]
    },
    {
      title: "Afbrydelser og genoprettelser",
      blocks: [
        "Hvis en spiller mister forbindelsen under et spil, fjernes deres plads ikke straks. Spillet fortsætter, og deres fremtidige ture kan håndteres af timeout-systemet, hvis de ikke vender tilbage i tide.",
        "Når spilleren genopretter forbindelsen med den samme browser-identitet og genoprettelsestoken, gendanner serveren deres rum, plads, forbindelsestilstand og sender et nyt personligt øjebliksbillede. Det øjebliksbillede indeholder den aktuelle spiltilstand og, hvis en tur er aktiv, den aktuelle turfrist.",
        "Hvis en spiller bevidst forlader et aktivt spil, behandles det som en opgivelse. Deres plads bliver en bot-plads, spilleren sendes tilbage til lobbyen, og de kan ikke tilslutte sig den samme plads igen. De resterende spillere fortsætter partiet."
      ]
    },
    {
      title: "Melding og spilgang",
      blocks: [
        "Hver runde starter med melding. Hver spiller melder én gang og vælger, hvor mange af de 7 stik de forventer at vinde. Gyldige meldinger er 0 til og med 7.",
        "Efter alle meldinger er afgivet, begynder spillefasen. Spillerne spiller én domino pr. stik. Vinderen af hvert stik åbner det næste stik.",
        "Serveren validerer hvert træk. En klient kan fremhæve mulige træk for nemheds skyld, men klienten afgør ikke, hvad der er lovligt. Serveren afviser ulovlige træk, træk fra den forkerte spiller, forældede tur-id'er og for sene handlinger."
      ]
    },
    {
      title: "Brik-regler",
      blocks: [
        "Trumfer er den stærkeste brikgruppe. Fra højest til lavest er trumfrækkefølgen:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Esser er:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Brikken 0-6 har en særlig dobbeltrolle. Hvis den spilles eller kræves som 0, opfører den sig som et es. Hvis den meldes som 6, opfører den sig som en almindelig 6-brik.",
        "Når et stik åbnes, må en spiller åbne med en hvilken som helst brik. Hvis den åbnende brik ikke er en trumf eller en dobbelt, og den har to forskellige tal, skal spilleren melde, hvilket tal der ønskes.",
        "Når man følger et stik:",
        {
          list: [
            "Hvis der blev åbnet med trumf, skal spillerne spille trumf, hvis de har en. Hvis de har en stærkere trumf end den stærkeste trumf, der allerede er i stikket, skal de spille en stærkere trumf.",
            "Hvis et tal blev ønsket, skal spillerne følge det tal med en ikke-trumf-brik, hvis det er muligt.",
            "Hvis de ikke kan følge det ønskede tal, skal de spille trumf, hvis de har en.",
            "Hvis de ikke kan følge og ikke har nogen trumf, må de smide en hvilken som helst brik."
          ]
        }
      ]
    },
    {
      title: "Pointgivning",
      blocks: [
        "Efter 7 stik gøres runden op ved at sammenligne hver spillers melding med det antal stik, de faktisk vandt.",
        {
          list: [
            "Præcis melding: 15 point pr. meldt stik.",
            "Præcis melding på 7: 105 point plus en bonus på 50 point.",
            "Flere stik end meldt: 5 point pr. vundet stik.",
            "Færre stik end meldt: -5 point pr. manglende stik.",
            "Mislykket melding på 7: -50 point."
          ]
        },
        "Rundens point lægges til partiets samlede sum. Efter det indstillede antal runder vinder spilleren med den højeste samlede score. Om nødvendigt bruger spillet tie-breakers baseret på score, melding, vundne stik og pladsrækkefølge fra giveren."
      ]
    },
    {
      title: "Privatliv og retfærdighed",
      blocks: [
        "Multiplayer-serveren er autoritativ. Den ejer den blandede bunke, spiltilstanden, timerfristerne, validering af lovlige træk, pointgivning og rundeforløb.",
        "Hver spiller modtager kun sin egen hånd. Andre spilleres skjulte brikker er ikke inkluderet i deres øjebliksbilleder. Offentlig information omfatter meldinger, vundne stik, samlede scorer, det aktuelle stik, fuldførte stik, spillerstatusser og hver spillers antal resterende brikker.",
        "Multiplayer-uddelingen genereres ud fra en server-side seed. Dette gør partier reproducerbare ud fra seedet og hændelseshistorikken, hvilket hjælper med retfærdighedstjek, replay, fejlfinding og gendannelse."
      ]
    },
    {
      title: "Statistik",
      blocks: [
        "Statistik tælles kun fra multiplayer-spil, hvor alle fire pladser er besat af fire forskellige registrerede (loggede ind) spillere."
      ]
    }
  ]
};
