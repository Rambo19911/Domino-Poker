import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesNo: MpRulesDoc = {
  intro: [
    "Dette spillet er svært dynamisk og krever god forståelse av spillereglene for å kunne ta beslutninger på kort tid. For trening anbefales det å spille enspillermodus.",
    "Domino Poker flerspiller er et sanntids bordspill med fire plasser. Hver kamp bruker et standard dobbel-seks dominosett med 28 brikker, delt ut som 7 brikker til hver plass. Spillet kan spilles av fire menneskelige spillere, eller av en blanding av mennesker og boter. En kamp kan bare starte når alle fire plasser er fylt og minst én plass er tatt av en menneskelig spiller."
  ],
  sections: [
    {
      title: "Offentlige og private rom",
      blocks: [
        "Spillere kan opprette enten et offentlig eller et privat rom.",
        "Offentlige rom er ment å være synlige fra lobbyen. Andre spillere kan finne dem i romlisten, åpne romvisningen, velge en ledig plass og bli med mens rommet fortsatt venter på å starte.",
        "Private rom er ment for inviterte spillere. De har fortsatt vanlig romstatus og plasser, men å bli med i et privat rom krever romkoden. Et privat rom kan ikke bli med kun ved å bruke rom-ID-en fra den offentlige lobbyflyten. Romkoden vises i romvisningen og bør bare deles med spillerne du vil invitere.",
        "Både offentlige og private rom støtter de samme spillereglene, det samme plassystemet, det samme botfyll-alternativet og den samme kampflyten. Forskjellen er synlighet og tilgang til å bli med: offentlige rom kan bli med fra lobbyen; private rom krever koden."
      ]
    },
    {
      title: "Romplasser og vertskontroller",
      blocks: [
        "Hvert rom har nøyaktig fire plasser. Spilleren som oppretter rommet, blir vert og plasseres på den første plassen. Andre spillere kan ta ledige plasser mens rommet venter.",
        "Verten kan fylle tomme plasser med boter. Dette gjør at et spill kan starte selv om færre enn fire menneskelige spillere er tilgjengelige. Verten er også den eneste spilleren som kan starte spillet.",
        "Et spill kan ikke starte hvis en plass fortsatt er tom. Hvis verten prøver å starte for tidlig, avviser serveren starten. Den praktiske regelen er enkel: fire opptatte plasser kreves, mennesker eller boter.",
        "Hvis verten forlater mens rommet fortsatt venter, går vertskapet over til en annen gjenværende menneskelig spiller. Hvis ingen menneskelige spillere blir igjen i et ventende rom, ødelegges rommet."
      ]
    },
    {
      title: "Gullmynter og betalte rom",
      blocks: [
        "Rom kan være gratis eller betalte. Når en innlogget vert oppretter et rom, kan vedkommende angi en inngangsavgift i gull — et hvilket som helst beløp opp til sin egen balanse (0 betyr et gratis rom, som oppfører seg nøyaktig som før).",
        "Bare registrerte, innloggede spillere kan ta en plass i et betalt rom: de har en gullbalanse. Anonyme spillere har ingen lommebok, så de kan ikke bli med i betalte rom, men de kan fortsatt bli med i gratis rom.",
        "Hver spiller betaler inngangsavgiften i det øyeblikket de tar en plass, inkludert verten. En plass kan bare tas hvis balansen dekker avgiften. De innsamlede avgiftene danner rommets premiepott.",
        "Før spillet starter, kan pengene refunderes fullt ut. Hvis du forlater plassen din mens rommet fortsatt venter, verten sletter det ventende rommet, eller rommet utløper før start, returneres inngangsavgiften til balansen din.",
        "Når spillet har startet, kan inngangsavgiften ikke lenger refunderes. Å forlate, gi opp eller koble fra under kampen returnerer ikke avgiften din — den blir i potten til vinnerne.",
        "Når kampen er over, deles potten mellom de to øverste registrerte menneskelige spillerne etter totalpoeng: 70% til førsteplass og 30% til andreplass. Boter får aldri en andel, og spillere som ga opp, utelukkes. Hvis bare ett registrert menneske er igjen, tar den spilleren hele potten.",
        "Hvis alle mennesker forlater og kampen forlates uten å fullføres, finnes det ingen vinner, så potten utbetales ikke.",
        "Balansen du ser, oppdateres direkte etter hvert som du betaler, får refusjon eller vinner potten. Serveren er alltid autoriteten for hver myntbevegelse."
      ]
    },
    {
      title: "Ett rom om gangen",
      blocks: [
        "En spiller kan bare være i ett rom om gangen. Hvis en spiller allerede har opprettet eller blitt med i et rom, vil serveren avvise forsøk på å opprette et annet rom eller bli med i et nytt før spilleren forlater det nåværende rommet, gir opp et aktivt spill, eller spillet er over og rommet ryddes opp.",
        "Dette hindrer én nettleseridentitet i å oppta plasser på tvers av flere rom samtidig.",
        "For lokal testing med flere menneskelige spillere på én maskin trenger hver spiller en egen nettleseridentitet, for eksempel ulike nettlesere eller inkognito-/privatvinduer."
      ]
    },
    {
      title: "Romlevetid og TTL",
      blocks: [
        "Rom har en levetid på 1 time fra opprettelsen.",
        "Ventende, startende, fullførte eller ødelagte rom ryddes opp etter at TTL-en deres utløper. Oppryddingen kjøres med jevne mellomrom, så fjerning kan skje kort tid etter det nøyaktige utløpstidspunktet i stedet for på det eksakte millisekundet.",
        "Aktive rom som er i spill, ødelegges ikke bare fordi den opprinnelige TTL-en passerer. Hvis en kamp allerede er i gang, får rommet fullføre. Etter at spillet er over, leverer serveren det endelige spillresultatet og ødelegger deretter rommet, slik at spillerne fritt kan opprette eller bli med i et annet rom.",
        "Hvis alle menneskelige spillere kobler fra et aktivt spill, gir serveren en kort nådeperiode for å koble til igjen. Hvis ingen mennesker returnerer i løpet av den nådeperioden, ødelegges det forlatte rommet."
      ]
    },
    {
      title: "Å starte spillet",
      blocks: [
        "Når verten starter et fullt rom, oppretter serveren den autoritative spilltilstanden og sender hver innsittende menneskelige spiller sitt eget personlige spilløyeblikksbilde. Hver spiller mottar bare sin egen hånd. Motstandernes skjulte brikker sendes aldri til andre spillere.",
        "Etter at rommet går inn i spillet, er det en 10-sekunders nedtelling før spillet før den første meldingsturen begynner. Dette gir spillerne tid til å laste bordet før selve turtimeren starter.",
        "Denne nedtellingen før spillet er atskilt fra 10-sekunders-timeren per tur."
      ]
    },
    {
      title: "10-sekunders-turtimeren",
      blocks: [
        "Hver menneskelig melding eller hvert trekk har sin egen 10-sekunders servkontrollerte timer.",
        "Timeren starter bare når det faktisk er den menneskelige spillerens tur. Hvis boter må handle før neste menneske, spiller serveren botene først, med en kort rytmeforsinkelse, og starter først deretter den menneskelige spillerens 10-sekunders nedtelling. Dette betyr at en menneskelig spiller ikke taper tid mens han venter på botanimasjoner eller at boternes turer skal fullføres.",
        "Serveren er tidsautoriteten. Klienten viser nedtellingen, men serveren avgjør om en handling kom inn før fristen.",
        "Hvis en spiller sender inn en melding eller et trekk før fristen, valideres handlingen og godtas bare hvis den er lovlig.",
        "Hvis handlingen kommer etter fristen, avviser serveren den som for sen.",
        "Hvis timeren utløper og spilleren ikke har handlet, løser serveren automatisk turen slik at spillet aldri stopper opp:",
        {
          list: [
            "Under melding tvinges den utløpte meldingen til en trygg, lovlig melding, normalt 0.",
            "Under brikkespill velger og spiller serveren et lovlig trekk for den spilleren.",
            "Hvis et stikk fullføres av det utløpte trekket, avgjør serveren stikkvinneren og fører spillet videre."
          ]
        },
        "Gjentatte tapte turer påvirker spillerens inaktivitetsstatus. Etter den første tapte turen merkes spilleren med en advarselstilstand. Etter den andre regnes vedkommende som inaktiv. Etter den tredje aktiveres autospill for den spilleren. En spiller som returnerer, kan gjenoppta og slå av autospill for å få tilbake manuell kontroll."
      ]
    },
    {
      title: "Frakoblinger og gjentilkoblinger",
      blocks: [
        "Hvis en spiller kobler fra under et spill, fjernes ikke plassen deres umiddelbart. Spillet fortsetter, og fremtidige turer kan håndteres av timeout-systemet hvis de ikke returnerer i tide.",
        "Når spilleren kobler til igjen med samme nettleseridentitet og gjentilkoblingstoken, gjenoppretter serveren rommet, plassen og tilkoblingstilstanden deres, og sender et ferskt personlig øyeblikksbilde. Det øyeblikksbildet inkluderer den nåværende spilltilstanden og, hvis en tur er aktiv, den nåværende turfristen.",
        "Hvis en spiller bevisst forlater under et aktivt spill, behandles det som en oppgivelse. Plassen deres blir en botplass, spilleren returneres til lobbyen, og de kan ikke ta den samme plassen igjen. De gjenværende spillerne fortsetter kampen."
      ]
    },
    {
      title: "Melding og spillforløp",
      blocks: [
        "Hver runde starter med melding. Hver spiller melder én gang og velger hvor mange av de 7 stikkene de forventer å vinne. Gyldige meldinger er 0 til 7.",
        "Etter at alle meldinger er lagt, begynner spillefasen. Spillerne spiller én domino per stikk. Vinneren av hvert stikk leder neste stikk.",
        "Serveren validerer hvert trekk. En klient kan fremheve mulige trekk for enkelhets skyld, men klienten avgjør ikke hva som er lovlig. Serveren avviser ulovlige trekk, trekk fra feil spiller, utdaterte tur-ID-er og sene handlinger."
      ]
    },
    {
      title: "Brikkeregler",
      blocks: [
        "Trumf er den sterkeste brikkegruppen. Fra høyest til lavest er trumfrekkefølgen:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Ess er:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Brikken 0-6 har en spesiell dobbeltrolle. Hvis den spilles eller kreves som 0, oppfører den seg som et ess. Hvis den meldes som 6, oppfører den seg som en vanlig 6-brikke.",
        "Når en spiller leder et stikk, kan vedkommende lede med hvilken som helst brikke. Hvis den ledede brikken ikke er en trumf eller dobbel, og den har to ulike tall, må spilleren melde hvilket tall som kreves.",
        "Når man følger et stikk:",
        {
          list: [
            "Hvis det ble ledet med trumf, må spillerne spille trumf hvis de har en. Hvis de har en sterkere trumf enn den sterkeste trumfen som allerede er i stikket, må de spille en sterkere trumf.",
            "Hvis et tall ble krevd, må spillerne følge det tallet med en ikke-trumfbrikke hvis mulig.",
            "Hvis de ikke kan følge det krevde tallet, må de spille trumf hvis de har en.",
            "Hvis de ikke kan følge og ikke har trumf, kan de kaste hvilken som helst brikke."
          ]
        }
      ]
    },
    {
      title: "Poengberegning",
      blocks: [
        "Etter 7 stikk beregnes runden ved å sammenligne hver spillers melding med antallet stikk de faktisk vant.",
        {
          list: [
            "Nøyaktig melding: 15 poeng per meldt stikk.",
            "Nøyaktig melding på 7: 105 poeng pluss en bonus på 50 poeng.",
            "Flere stikk enn meldt: 5 poeng per vunnet stikk.",
            "Færre stikk enn meldt: -5 poeng per manglende stikk.",
            "Mislykket melding på 7: -50 poeng."
          ]
        },
        "Rundepoengene legges til kamptotalen. Etter det konfigurerte antallet runder vinner spilleren med høyest totalpoengsum. Om nødvendig bruker spillet avgjørelser ved uavgjort basert på poeng, melding, vunne stikk og plassrekkefølge fra giveren."
      ]
    },
    {
      title: "Personvern og rettferdighet",
      blocks: [
        "Flerspillerserveren er autoritativ. Den eier den stokkede kortstokken, spilltilstanden, timerfristene, validering av lovlige trekk, poengberegning og rundeforløp.",
        "Hver spiller mottar bare sin egen hånd. Andre spilleres skjulte brikker er ikke inkludert i øyeblikksbildene deres. Offentlig informasjon inkluderer meldinger, vunne stikk, totalpoeng, gjeldende stikk, fullførte stikk, spillerstatuser og hver spillers gjenværende antall brikker.",
        "Flerspillerutdelingen genereres fra en serverside-seed. Dette gjør kamper reproduserbare fra seeden og hendelseshistorikken, noe som hjelper med rettferdighetskontroller, reprise, feilsøking og gjenoppretting."
      ]
    },
    {
      title: "Statistikk",
      blocks: [
        "Statistikk telles kun fra flerspillerspill der alle fire plasser er tatt av fire ulike registrerte (innloggede) spillere."
      ]
    }
  ]
};
