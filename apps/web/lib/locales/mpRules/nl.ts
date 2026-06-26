import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesNl: MpRulesDoc = {
  intro: [
    "Dit spel is erg dynamisch en vereist een goed begrip van de spelregels om in korte tijd beslissingen te kunnen nemen. Om te oefenen wordt aangeraden om de singleplayermodus te spelen.",
    "Domino Poker multiplayer is een realtime tafelspel met vier plaatsen. Elke partij gebruikt een standaard dubbel-zes-dominoset met 28 stenen, verdeeld als 7 stenen per plaats. Het spel kan worden gespeeld door vier menselijke spelers, of door een mix van mensen en bots. Een partij kan alleen beginnen wanneer alle vier de plaatsen bezet zijn en minstens één plaats wordt ingenomen door een menselijke speler."
  ],
  sections: [
    {
      title: "Openbare en privékamers",
      blocks: [
        "Spelers kunnen een openbare of een privékamer maken.",
        "Openbare kamers zijn bedoeld om vanuit de lobby gevonden te worden. Andere spelers kunnen ze terugvinden in de kamerlijst, het kameroverzicht openen, een vrije plaats kiezen en deelnemen zolang de kamer nog op het starten wacht.",
        "Privékamers zijn bedoeld voor uitgenodigde spelers. Ze hebben dezelfde normale kamerstatus en plaatsen, maar deelnemen aan een privékamer vereist de kamercode. Aan een privékamer kun je niet deelnemen door simpelweg het kamer-id uit de openbare lobbyflow te gebruiken. De kamercode wordt in het kameroverzicht getoond en mag alleen worden gedeeld met de spelers die je wilt uitnodigen.",
        "Zowel openbare als privékamers ondersteunen dezelfde spelregels, hetzelfde plaatsensysteem, dezelfde optie om met bots aan te vullen en hetzelfde partijverloop. Het verschil zit in de vindbaarheid en de toegang om deel te nemen: aan openbare kamers kun je vanuit de lobby deelnemen; privékamers vereisen de code."
      ]
    },
    {
      title: "Kamerplaatsen en hostbediening",
      blocks: [
        "Elke kamer heeft precies vier plaatsen. De speler die de kamer maakt, wordt de host en wordt op de eerste plaats gezet. Andere spelers kunnen vrije plaatsen innemen terwijl de kamer wacht.",
        "De host kan lege plaatsen met bots aanvullen. Hierdoor kan een spel beginnen, zelfs als er minder dan vier menselijke spelers beschikbaar zijn. De host is ook de enige speler die het spel kan starten.",
        "Een spel kan niet beginnen als er nog een plaats leeg is. Als de host te vroeg probeert te starten, wijst de server het starten af. De praktische regel is eenvoudig: er zijn vier bezette plaatsen nodig, mensen of bots.",
        "Als de host vertrekt terwijl de kamer nog wacht, gaat het hostschap over naar een andere overgebleven menselijke speler. Als er geen menselijke spelers meer in een wachtende kamer zitten, wordt de kamer vernietigd."
      ]
    },
    {
      title: "Goudmunten en betaalde kamers",
      blocks: [
        "Kamers kunnen gratis of betaald zijn. Bij het maken van een kamer kan een ingelogde host een goud-inleg instellen — een willekeurig bedrag tot aan zijn eigen saldo (0 betekent een gratis kamer, die zich precies gedraagt zoals voorheen).",
        "Alleen geregistreerde, ingelogde spelers kunnen een plaats innemen in een betaalde kamer: zij hebben een goudsaldo. Anonieme spelers hebben geen portemonnee, dus zij kunnen niet aan betaalde kamers deelnemen, maar wel aan gratis kamers.",
        "Elke speler betaalt de inleg op het moment dat hij een plaats inneemt, inclusief de host. Een plaats kan alleen worden ingenomen als het saldo de inleg dekt. De geïnde inleggen vormen samen de prijzenpot van de kamer.",
        "Voordat het spel begint, is het geld volledig terugbetaalbaar. Als je je plaats verlaat terwijl de kamer nog wacht, de host de wachtende kamer verwijdert, of de kamer verloopt voordat hij start, wordt je inleg teruggestort op je saldo.",
        "Zodra het spel begint, is de inleg niet meer terugbetaalbaar. Vertrekken, opgeven of de verbinding verliezen tijdens de partij geeft je inleg niet terug — die blijft in de pot voor de winnaars.",
        "Wanneer de partij eindigt, wordt de pot verdeeld tussen de twee beste geregistreerde menselijke spelers op basis van totaalscore: 70% voor de eerste plaats en 30% voor de tweede. Bots ontvangen nooit een deel, en spelers die hebben opgegeven worden uitgesloten. Als er slechts één geregistreerde mens overblijft, neemt die speler de hele pot.",
        "Als iedere mens vertrekt en de partij wordt verlaten zonder af te maken, is er geen winnaar, dus de pot wordt niet uitbetaald.",
        "Het saldo dat je ziet, wordt live bijgewerkt naarmate je betaalt, terugbetaald wordt of de pot wint. De server is altijd de autoriteit over elke muntbeweging."
      ]
    },
    {
      title: "Eén kamer tegelijk",
      blocks: [
        "Een speler kan slechts in één kamer tegelijk zitten. Als een speler al een kamer heeft gemaakt of eraan is toegetreden, wijst de server pogingen om een andere kamer te maken of aan een andere deel te nemen af, totdat die speler de huidige kamer verlaat, een actief spel opgeeft, of het spel eindigt en de kamer wordt opgeruimd.",
        "Dit voorkomt dat één browseridentiteit tegelijk plaatsen in meerdere kamers bezet.",
        "Voor lokaal testen met meerdere menselijke spelers op één machine heeft elke speler een aparte browseridentiteit nodig, zoals verschillende browsers of incognito-/privévensters."
      ]
    },
    {
      title: "Levensduur van een kamer en TTL",
      blocks: [
        "Kamers hebben een levensduur (TTL) van 1 uur vanaf het maken.",
        "Wachtende, startende, voltooide of vernietigde kamers worden opgeruimd nadat hun TTL is verlopen. Het opruimen gebeurt periodiek, dus het verwijderen kan kort na het exacte verlooptijdstip gebeuren in plaats van op de exacte milliseconde.",
        "Actieve kamers die in het spel zijn, worden niet vernietigd louter omdat de oorspronkelijke TTL is verstreken. Als een partij al bezig is, mag de kamer eerst afmaken. Nadat het spel eindigt, levert de server het eindresultaat af en vernietigt vervolgens de kamer, zodat spelers vrij zijn om een andere kamer te maken of eraan deel te nemen.",
        "Als alle menselijke spelers de verbinding met een actief spel verliezen, geeft de server een korte respijtperiode om opnieuw te verbinden. Als er tijdens die periode geen mens terugkeert, wordt de verlaten kamer vernietigd."
      ]
    },
    {
      title: "Het spel starten",
      blocks: [
        "Wanneer de host een volle kamer start, maakt de server de gezaghebbende spelstatus aan en stuurt hij elke gezeten menselijke speler zijn eigen persoonlijke momentopname van het spel. Elke speler ontvangt alleen zijn eigen hand. De verborgen stenen van tegenstanders worden nooit naar andere spelers gestuurd.",
        "Nadat de kamer het spel binnengaat, is er een aftelling van 10 seconden vóór het spel voordat de eerste biedbeurt begint. Dit geeft spelers tijd om de tafel te laden voordat de echte beurttimer start.",
        "Deze aftelling vóór het spel staat los van de 10-secondentimer per beurt."
      ]
    },
    {
      title: "De 10-secondenbeurttimer",
      blocks: [
        "Elk menselijk bod of elke menselijke zet heeft zijn eigen door de server gestuurde timer van 10 seconden.",
        "De timer start pas wanneer het daadwerkelijk de beurt van die menselijke speler is. Als er bots moeten handelen vóór de volgende mens, speelt de server eerst de bots, met een korte ritmevertraging, en pas daarna start de aftelling van 10 seconden van de menselijke speler. Dit betekent dat een menselijke speler geen tijd verliest terwijl hij wacht op botanimaties of het afhandelen van botbeurten.",
        "De server is de tijdsautoriteit. De client toont de aftelling, maar de server beslist of een actie vóór de deadline is aangekomen.",
        "Als een speler een bod of zet vóór de deadline indient, wordt de actie gevalideerd en alleen geaccepteerd als ze geldig is.",
        "Als de actie na de deadline aankomt, wijst de server haar af als te laat.",
        "Als de timer afloopt en de speler niet heeft gehandeld, lost de server de beurt automatisch op zodat het spel nooit vastloopt:",
        {
          list: [
            "Tijdens het bieden wordt het bod bij time-out gedwongen naar een veilig, geldig bod, normaal gesproken 0.",
            "Tijdens het stenen spelen kiest en speelt de server een geldige zet voor die speler.",
            "Als een slag wordt voltooid door de time-outzet, bepaalt de server de winnaar van de slag en zet het spel voort."
          ]
        },
        "Herhaaldelijk gemiste beurten beïnvloeden de inactiviteitsstatus van de speler. Na de eerste gemiste beurt wordt de speler met een waarschuwingsstatus gemarkeerd. Na de tweede wordt hij als inactief beschouwd. Na de derde wordt automatisch spelen voor die speler ingeschakeld. Een terugkerende speler kan hervatten en automatisch spelen uitschakelen om de handmatige controle terug te krijgen."
      ]
    },
    {
      title: "Verbroken verbindingen en opnieuw verbinden",
      blocks: [
        "Als een speler tijdens een spel de verbinding verliest, wordt zijn plaats niet meteen verwijderd. Het spel gaat door, en zijn toekomstige beurten kunnen door het time-outsysteem worden afgehandeld als hij niet op tijd terugkeert.",
        "Wanneer de speler opnieuw verbindt met dezelfde browseridentiteit en hetzelfde herverbindingstoken, herstelt de server zijn kamer, plaats en verbindingsstatus en stuurt hij een verse persoonlijke momentopname. Die momentopname bevat de huidige spelstatus en, als er een beurt actief is, de huidige beurtdeadline.",
        "Als een speler tijdens een actief spel bewust vertrekt, wordt dat behandeld als opgeven. Zijn plaats wordt een botplaats, de speler wordt teruggestuurd naar de lobby en hij kan niet weer dezelfde plaats innemen. De overige spelers zetten de partij voort."
      ]
    },
    {
      title: "Bieden en spelverloop",
      blocks: [
        "Elke ronde begint met bieden. Elke speler biedt eenmaal en kiest hoeveel van de 7 slagen hij verwacht te winnen. Geldige biedingen zijn 0 tot en met 7.",
        "Nadat alle biedingen zijn geplaatst, begint de speelfase. Spelers spelen één domino per slag. De winnaar van elke slag start de volgende slag.",
        "De server valideert elke zet. Een client mag voor het gemak mogelijke zetten markeren, maar de client beslist niet wat geldig is. De server wijst ongeldige zetten, zetten van de verkeerde speler, verouderde beurt-id's en te late acties af."
      ]
    },
    {
      title: "Steenregels",
      blocks: [
        "Troeven zijn de sterkste groep stenen. Van hoogste naar laagste is de troefvolgorde:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Azen zijn:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "De steen 0-6 heeft een bijzondere dubbele rol. Als hij als 0 wordt gespeeld of gevraagd, gedraagt hij zich als een aas. Als hij als 6 wordt aangekondigd, gedraagt hij zich als een gewone 6-steen.",
        "Bij het starten van een slag mag een speler met elke steen beginnen. Als de uitgespeelde steen geen troef of dubbel is en twee verschillende nummers heeft, moet de speler aankondigen welk nummer wordt gevraagd.",
        "Bij het volgen van een slag:",
        {
          list: [
            "Als een troef is uitgespeeld, moeten spelers een troef spelen als ze die hebben. Als ze een sterkere troef hebben dan de sterkste troef die al in de slag ligt, moeten ze een sterkere troef spelen.",
            "Als een nummer is gevraagd, moeten spelers dat nummer indien mogelijk volgen met een niet-troefsteen.",
            "Als ze het gevraagde nummer niet kunnen volgen, moeten ze een troef spelen als ze die hebben.",
            "Als ze niet kunnen volgen en geen troef hebben, mogen ze een willekeurige steen afgooien."
          ]
        }
      ]
    },
    {
      title: "Scoren",
      blocks: [
        "Na 7 slagen wordt de ronde gescoord door het bod van elke speler te vergelijken met het aantal slagen dat hij daadwerkelijk won.",
        {
          list: [
            "Exact bod: 15 punten per geboden slag.",
            "Exact bod van 7: 105 punten plus een bonus van 50 punten.",
            "Meer slagen dan geboden: 5 punten per gewonnen slag.",
            "Minder slagen dan geboden: -5 punten per gemiste slag.",
            "Mislukt bod van 7: -50 punten."
          ]
        },
        "Rondescores worden bij het partijtotaal opgeteld. Na het ingestelde aantal rondes wint de speler met de hoogste totaalscore. Indien nodig gebruikt het spel beslissende criteria op basis van score, bod, gewonnen slagen en zitvolgorde vanaf de gever."
      ]
    },
    {
      title: "Privacy en eerlijkheid",
      blocks: [
        "De multiplayerserver is gezaghebbend. Hij beheert het geschudde dek, de spelstatus, de timerdeadlines, de validatie van geldige zetten, het scoren en de rondevoortgang.",
        "Elke speler ontvangt alleen zijn eigen hand. De verborgen stenen van andere spelers zijn niet opgenomen in hun momentopnamen. Openbare informatie omvat biedingen, gewonnen slagen, totaalscores, de huidige slag, voltooide slagen, spelersstatussen en het resterende aantal stenen van elke speler.",
        "De multiplayerdeling wordt gegenereerd uit een seed aan de serverkant. Hierdoor zijn partijen reproduceerbaar vanuit de seed en de gebeurtenisgeschiedenis, wat helpt bij eerlijkheidscontroles, herhaling, foutopsporing en herstel."
      ]
    },
    {
      title: "Statistieken",
      blocks: [
        "Statistieken tellen alleen mee uit multiplayerspellen waarin alle vier de plaatsen worden ingenomen door vier verschillende geregistreerde (ingelogde) spelers."
      ]
    }
  ]
};
