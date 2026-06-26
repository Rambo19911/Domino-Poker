import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesSv: MpRulesDoc = {
  intro: [
    "Det här spelet är mycket dynamiskt och kräver en god förståelse för spelreglerna för att kunna fatta beslut på kort tid. För träning rekommenderas läget för en spelare.",
    "Domino Poker i flerspelarläge är ett bordsspel i realtid med fyra platser. Varje match använder en standard dubbel-sex-domino med 28 brickor, som delas ut med 7 brickor till varje plats. Spelet kan spelas av fyra mänskliga spelare eller av en blandning av människor och bottar. En match kan starta först när alla fyra platser är fyllda och minst en plats upptas av en mänsklig spelare."
  ],
  sections: [
    {
      title: "Offentliga och privata rum",
      blocks: [
        "Spelare kan skapa antingen ett offentligt eller ett privat rum.",
        "Offentliga rum är avsedda att kunna hittas från lobbyn. Andra spelare kan hitta dem i rumslistan, öppna rumsvyn, välja en ledig plats och gå med medan rummet fortfarande väntar på att starta.",
        "Privata rum är avsedda för inbjudna spelare. De har fortfarande normalt rumstillstånd och platser, men för att gå med i ett privat rum krävs rumskoden. Ett privat rum går inte att gå med i bara genom att använda dess rums-id från det offentliga lobbyflödet. Rumskoden visas i rumsvyn och bör endast delas med de spelare du vill bjuda in.",
        "Både offentliga och privata rum stöder samma spelregler, samma platssystem, samma alternativ att fylla med bottar och samma matchförlopp. Skillnaden är upptäckbarhet och åtkomst för att gå med: offentliga rum går att gå med i från lobbyn; privata rum kräver koden."
      ]
    },
    {
      title: "Rumsplatser och värdens kontroller",
      blocks: [
        "Varje rum har exakt fyra platser. Spelaren som skapar rummet blir värd och placeras på den första platsen. Andra spelare kan gå med på lediga platser medan rummet väntar.",
        "Värden kan fylla lediga platser med bottar. Detta gör att ett spel kan starta även om färre än fyra mänskliga spelare är tillgängliga. Värden är också den enda spelaren som kan starta spelet.",
        "Ett spel kan inte starta om någon plats fortfarande är ledig. Om värden försöker starta för tidigt avvisar servern starten. Den praktiska regeln är enkel: fyra upptagna platser krävs, människor eller bottar.",
        "Om värden lämnar medan rummet fortfarande väntar går värdskapet över till en annan kvarvarande mänsklig spelare. Om inga mänskliga spelare återstår i ett väntande rum förstörs rummet."
      ]
    },
    {
      title: "Guldmynt och betalda rum",
      blocks: [
        "Rum kan vara gratis eller betalda. När ett rum skapas kan en inloggad värd ange en insats i guld — vilket belopp som helst upp till sitt eget saldo (0 betyder ett gratis rum, som fungerar precis som förut).",
        "Endast registrerade, inloggade spelare kan ta en plats i ett betalt rum: de har ett guldsaldo. Anonyma spelare har ingen plånbok, så de kan inte gå med i betalda rum, men de kan fortfarande gå med i gratis rum.",
        "Varje spelare betalar insatsen i det ögonblick de tar en plats, inklusive värden. En plats kan endast tas om saldot täcker insatsen. De insamlade insatserna bildar rummets vinstpott.",
        "Innan spelet startar är pengarna fullt återbetalningsbara. Om du lämnar din plats medan rummet fortfarande väntar, värden raderar det väntande rummet, eller rummet förfaller innan det startar, återförs din insats till ditt saldo.",
        "När spelet väl har startat är insatsen inte längre återbetalningsbar. Att lämna, ge upp eller koppla från under matchen återför inte din insats — den stannar i potten åt vinnarna.",
        "När matchen slutar delas potten mellan de två bästa registrerade mänskliga spelarna efter totalpoäng: 70% till första plats och 30% till andra. Bottar får aldrig någon andel, och spelare som gett upp är uteslutna. Om endast en registrerad människa återstår tar den spelaren hela potten.",
        "Om varje människa lämnar och matchen överges utan att avslutas finns det ingen vinnare, så potten betalas inte ut.",
        "Saldot du ser uppdateras i realtid när du betalar, får återbetalning eller vinner potten. Servern är alltid auktoriteten över varje myntrörelse."
      ]
    },
    {
      title: "Ett rum åt gången",
      blocks: [
        "En spelare kan bara vara i ett rum åt gången. Om en spelare redan har skapat eller gått med i ett rum avvisar servern försök att skapa ett annat rum eller gå med i ett annat tills den spelaren lämnar det aktuella rummet, ger upp ett aktivt spel, eller spelet slutar och rummet städas upp.",
        "Detta förhindrar att en webbläsaridentitet upptar platser i flera rum samtidigt.",
        "För lokal testning med flera mänskliga spelare på en maskin behöver varje spelare en separat webbläsaridentitet, till exempel olika webbläsare eller inkognito-/privata fönster."
      ]
    },
    {
      title: "Rummets livslängd och TTL",
      blocks: [
        "Rum har en livslängd (TTL) på 1 timme från skapandet.",
        "Väntande, startande, avslutade eller förstörda rum städas upp efter att deras TTL gått ut. Uppstädningen körs periodiskt, så borttagningen kan ske strax efter den exakta utgångstiden snarare än på exakt millisekund.",
        "Aktiva rum i pågående spel förstörs inte bara för att den ursprungliga TTL:n passerar. Om en match redan pågår tillåts rummet att avslutas. Efter att spelet slutat levererar servern det slutgiltiga spelresultatet och förstör sedan rummet så att spelarna är fria att skapa eller gå med i ett annat rum.",
        "Om alla mänskliga spelare kopplar från ett aktivt spel ger servern en kort återanslutningsperiod. Om ingen människa återvänder under den perioden förstörs det övergivna rummet."
      ]
    },
    {
      title: "Att starta spelet",
      blocks: [
        "När värden startar ett fullt rum skapar servern det auktoritativa speltillståndet och skickar varje sittande mänsklig spelare sin egen personliga ögonblicksbild av spelet. Varje spelare får endast sin egen hand. Motståndarnas dolda brickor skickas aldrig till andra spelare.",
        "Efter att rummet går in i spelet sker en 10-sekunders nedräkning före spelet innan den första budomgången börjar. Detta ger spelarna tid att ladda bordet innan den riktiga dragtimern startar.",
        "Denna nedräkning före spelet är skild från 10-sekunderstimern per drag."
      ]
    },
    {
      title: "10-sekunderstimern per drag",
      blocks: [
        "Varje mänskligt bud eller drag har sin egen 10-sekunders serverstyrda timer.",
        "Timern startar först när det faktiskt är den mänskliga spelarens tur. Om bottar behöver agera innan nästa människa spelar servern bottarna först, med en kort fördröjning för tempot, och startar sedan den mänskliga spelarens 10-sekundersnedräkning. Detta innebär att en mänsklig spelare inte förlorar tid medan han väntar på botanimationer eller på att botturer ska avgöras.",
        "Servern är tidsauktoriteten. Klienten visar nedräkningen, men servern avgör om en åtgärd kom in före tidsfristen.",
        "Om en spelare skickar in ett bud eller drag före tidsfristen valideras åtgärden och accepteras endast om den är tillåten.",
        "Om åtgärden kommer in efter tidsfristen avvisar servern den som för sen.",
        "Om timern går ut och spelaren inte har agerat avgör servern automatiskt turen så att spelet aldrig stannar upp:",
        {
          list: [
            "Under budgivningen tvingas tidsfristbudet till ett säkert tillåtet bud, normalt 0.",
            "Under brickspelet väljer servern och spelar ett tillåtet drag åt den spelaren.",
            "Om ett stick avslutas av tidsfristdraget avgör servern stickets vinnare och för spelet framåt."
          ]
        },
        "Upprepade missade turer påverkar spelarens inaktivitetsstatus. Efter den första missade turen markeras spelaren med ett varningstillstånd. Efter den andra anses spelaren vara inaktiv. Efter den tredje aktiveras autospel för den spelaren. En återvändande spelare kan fortsätta och stänga av autospel för att återfå manuell kontroll."
      ]
    },
    {
      title: "Frånkopplingar och återanslutningar",
      blocks: [
        "Om en spelare kopplar från under ett spel tas deras plats inte bort omedelbart. Spelet fortsätter, och deras framtida turer kan hanteras av tidsfristsystemet om de inte återvänder i tid.",
        "När spelaren återansluter med samma webbläsaridentitet och återanslutningstoken återställer servern deras rum, plats och anslutningstillstånd och skickar en ny personlig ögonblicksbild. Den ögonblicksbilden inkluderar det aktuella speltillståndet och, om en tur är aktiv, den aktuella turens tidsfrist.",
        "Om en spelare medvetet lämnar under ett aktivt spel behandlas det som att ge upp. Deras plats blir en botplats, spelaren återförs till lobbyn och kan inte återansluta till samma plats. De återstående spelarna fortsätter matchen."
      ]
    },
    {
      title: "Budgivning och spel",
      blocks: [
        "Varje rond börjar med budgivning. Varje spelare budar en gång och väljer hur många av de 7 sticken de förväntar sig att vinna. Giltiga bud är 0 till 7.",
        "Efter att alla bud lagts börjar spelfasen. Spelarna spelar en domino per stick. Vinnaren av varje stick spelar ut till nästa stick.",
        "Servern validerar varje drag. En klient kan markera möjliga drag för bekvämlighets skull, men klienten avgör inte vad som är tillåtet. Servern avvisar otillåtna drag, drag av fel spelare, föråldrade tur-id och sena åtgärder."
      ]
    },
    {
      title: "Brickregler",
      blocks: [
        "Trumf är den starkaste brickgruppen. Från högsta till lägsta är trumfordningen:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Essen är:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Brickan 0-6 har en särskild dubbelroll. Om den spelas eller krävs som 0 fungerar den som ett ess. Om den deklareras som 6 fungerar den som en vanlig 6:a.",
        "När en spelare leder ett stick får de spela ut vilken bricka som helst. Om den utspelade brickan inte är en trumf eller dubbel och har två olika tal måste spelaren deklarera vilket tal som efterfrågas.",
        "När man följer ett stick:",
        {
          list: [
            "Om trumf spelades ut måste spelarna spela trumf om de har en. Om de har en starkare trumf än den starkaste trumf som redan finns i sticket måste de spela en starkare trumf.",
            "Om ett tal efterfrågades måste spelarna följa det talet med en icke-trumfbricka om möjligt.",
            "Om de inte kan följa det efterfrågade talet måste de spela trumf om de har en.",
            "Om de inte kan följa och inte har någon trumf får de kasta vilken bricka som helst."
          ]
        }
      ]
    },
    {
      title: "Poängräkning",
      blocks: [
        "Efter 7 stick poängsätts ronden genom att varje spelares bud jämförs med antalet stick de faktiskt vann.",
        {
          list: [
            "Exakt bud: 15 poäng per budat stick.",
            "Exakt bud på 7: 105 poäng plus en bonus på 50 poäng.",
            "Fler stick än budat: 5 poäng per vunnet stick.",
            "Färre stick än budat: -5 poäng per missat stick.",
            "Misslyckat bud på 7: -50 poäng."
          ]
        },
        "Rondpoängen läggs till matchens totalsumma. Efter det inställda antalet ronder vinner spelaren med högst totalpoäng. Vid behov använder spelet utslagskriterier baserade på poäng, bud, vunna stick och platsordning från given."
      ]
    },
    {
      title: "Integritet och rättvisa",
      blocks: [
        "Flerspelarservern är auktoritativ. Den äger den blandade kortleken, speltillståndet, timerns tidsfrister, valideringen av tillåtna drag, poängräkningen och rondernas förlopp.",
        "Varje spelare får endast sin egen hand. Andra spelares dolda brickor ingår inte i deras ögonblicksbilder. Offentlig information inkluderar bud, vunna stick, totalpoäng, aktuellt stick, avslutade stick, spelarstatusar och varje spelares antal kvarvarande brickor.",
        "Flerspelarutdelningen genereras från ett serverframställt frö. Detta gör matcherna reproducerbara från fröet och händelsehistoriken, vilket hjälper vid rättvisekontroller, repris, felsökning och återställning."
      ]
    },
    {
      title: "Statistik",
      blocks: [
        "Statistik räknas endast från flerspelarspel där alla fyra platser tas av fyra olika registrerade (inloggade) spelare."
      ]
    }
  ]
};
