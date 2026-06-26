import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesFi: MpRulesDoc = {
  intro: [
    "Tämä peli on hyvin dynaaminen ja vaatii hyvää pelin sääntöjen ymmärrystä, jotta päätöksiä voi tehdä lyhyessä ajassa. Harjoitteluun suositellaan yksinpelitilan pelaamista.",
    "Domino Pokerin moninpeli on reaaliaikainen neljän paikan pöytäpeli. Jokaisessa ottelussa käytetään tavallista kaksoiskuutosdominopakkaa, jossa on 28 laattaa, jaettuna 7 laattaa kullekin paikalle. Peliä voi pelata neljä ihmispelaajaa tai ihmisten ja bottien sekoitus. Ottelu voi alkaa vain, kun kaikki neljä paikkaa on täytetty ja ainakin yhdellä paikalla istuu ihmispelaaja."
  ],
  sections: [
    {
      title: "Julkiset ja yksityiset huoneet",
      blocks: [
        "Pelaajat voivat luoda joko julkisen tai yksityisen huoneen.",
        "Julkiset huoneet on tarkoitettu löydettäviksi aulasta. Muut pelaajat voivat löytää ne huoneluettelosta, avata huonenäkymän, valita tyhjän paikan ja liittyä, kun huone vielä odottaa aloitusta.",
        "Yksityiset huoneet on tarkoitettu kutsutuille pelaajille. Niillä on edelleen normaali huonetila ja paikat, mutta yksityiseen huoneeseen liittyminen vaatii huoneen koodin. Yksityiseen huoneeseen ei voi liittyä pelkästään käyttämällä sen huonetunnusta julkisen aulan kautta. Huoneen koodi näytetään huonenäkymässä, ja se tulisi jakaa vain niille pelaajille, jotka haluat kutsua.",
        "Sekä julkiset että yksityiset huoneet tukevat samoja pelin sääntöjä, samaa paikkajärjestelmää, samaa bottien täyttövaihtoehtoa ja samaa ottelun kulkua. Ero on löydettävyydessä ja liittymispääsyssä: julkisiin huoneisiin voi liittyä aulasta; yksityiset vaativat koodin."
      ]
    },
    {
      title: "Huoneen paikat ja isännän hallinta",
      blocks: [
        "Jokaisessa huoneessa on tasan neljä paikkaa. Pelaajasta, joka luo huoneen, tulee isäntä, ja hänet sijoitetaan ensimmäiselle paikalle. Muut pelaajat voivat liittyä vapaisiin paikkoihin, kun huone odottaa.",
        "Isäntä voi täyttää tyhjät paikat boteilla. Tämä mahdollistaa pelin aloittamisen, vaikka käytettävissä olisi vähemmän kuin neljä ihmispelaajaa. Isäntä on myös ainoa pelaaja, joka voi aloittaa pelin.",
        "Peliä ei voi aloittaa, jos jokin paikka on vielä tyhjä. Jos isäntä yrittää aloittaa liian aikaisin, palvelin hylkää aloituksen. Käytännön sääntö on yksinkertainen: vaaditaan neljä täytettyä paikkaa, ihmisiä tai botteja.",
        "Jos isäntä poistuu huoneen vielä odottaessa, isännyys siirtyy toiselle jäljellä olevalle ihmispelaajalle. Jos odottavaan huoneeseen ei jää yhtään ihmispelaajaa, huone tuhotaan."
      ]
    },
    {
      title: "Kultakolikot ja maksulliset huoneet",
      blocks: [
        "Huoneet voivat olla ilmaisia tai maksullisia. Huonetta luotaessa kirjautunut isäntä voi asettaa kultaosallistumismaksun — minkä tahansa summan oman saldonsa rajoissa (0 tarkoittaa ilmaista huonetta, joka toimii täsmälleen kuten ennenkin).",
        "Vain rekisteröityneet, kirjautuneet pelaajat voivat ottaa paikan maksullisessa huoneessa: heillä on kultasaldo. Anonyymeillä pelaajilla ei ole lompakkoa, joten he eivät voi liittyä maksullisiin huoneisiin, mutta he voivat silti liittyä ilmaisiin huoneisiin.",
        "Jokainen pelaaja maksaa osallistumismaksun ottaessaan paikan, isäntä mukaan lukien. Paikan voi ottaa vain, jos saldo kattaa maksun. Kerätyt maksut muodostavat huoneen palkintopotin.",
        "Ennen pelin alkua raha on täysin palautuskelpoinen. Jos poistut paikaltasi huoneen vielä odottaessa, isäntä poistaa odottavan huoneen tai huone vanhenee ennen aloitusta, osallistumismaksusi palautetaan saldollesi.",
        "Kun peli on alkanut, osallistumismaksua ei enää palauteta. Poistuminen, luovuttaminen tai yhteyden katkeaminen ottelun aikana ei palauta maksuasi — se jää pottiin voittajille.",
        "Kun ottelu päättyy, potti jaetaan kahden parhaan rekisteröityneen ihmispelaajan kesken kokonaispistemäärän mukaan: 70% ensimmäiselle sijalle ja 30% toiselle. Botit eivät koskaan saa osuutta, ja luovuttaneet pelaajat suljetaan pois. Jos jäljellä on vain yksi rekisteröitynyt ihminen, kyseinen pelaaja saa koko potin.",
        "Jos kaikki ihmiset poistuvat ja ottelu hylätään sitä päättämättä, voittajaa ei ole, joten pottia ei makseta.",
        "Näkemäsi saldo päivittyy reaaliajassa, kun maksat, saat hyvityksen tai voitat potin. Palvelin on aina auktoriteetti jokaisen kolikon liikkeen suhteen."
      ]
    },
    {
      title: "Yksi huone kerrallaan",
      blocks: [
        "Pelaaja voi olla vain yhdessä huoneessa kerrallaan. Jos pelaaja on jo luonut huoneen tai liittynyt siihen, palvelin hylkää yritykset luoda toinen huone tai liittyä toiseen, kunnes kyseinen pelaaja poistuu nykyisestä huoneesta, luovuttaa aktiivisen pelin tai peli päättyy ja huone siivotaan pois.",
        "Tämä estää yhtä selainidentiteettiä varaamasta paikkoja useista huoneista yhtä aikaa.",
        "Paikalliseen testaukseen useilla ihmispelaajilla yhdellä koneella jokainen pelaaja tarvitsee oman selainidentiteetin, kuten eri selaimet tai incognito-/yksityisikkunat."
      ]
    },
    {
      title: "Huoneen elinikä ja TTL",
      blocks: [
        "Huoneilla on elinaika (time-to-live) 1 tunti luomisesta.",
        "Odottavat, alkavat, päättyneet tai tuhotut huoneet siivotaan pois TTL-ajan päätyttyä. Siivous suoritetaan ajoittain, joten poisto voi tapahtua hieman tarkan vanhenemisajan jälkeen eikä juuri tietyllä millisekunnilla.",
        "Aktiivisia, peliä pelaavia huoneita ei tuhota pelkästään siksi, että alkuperäinen TTL kuluu umpeen. Jos ottelu on jo käynnissä, huoneen annetaan päättyä. Pelin päätyttyä palvelin toimittaa lopullisen pelituloksen ja tuhoaa sitten huoneen, jotta pelaajat voivat vapaasti luoda tai liittyä toiseen huoneeseen.",
        "Jos kaikki ihmispelaajat katkaisevat yhteyden aktiivisesta pelistä, palvelin antaa lyhyen uudelleenyhdistymisen armonajan. Jos yksikään ihminen ei palaa kyseisen armonajan aikana, hylätty huone tuhotaan."
      ]
    },
    {
      title: "Pelin aloittaminen",
      blocks: [
        "Kun isäntä aloittaa täyden huoneen, palvelin luo auktoritatiivisen pelitilan ja lähettää jokaiselle istuvalle ihmispelaajalle hänen oman henkilökohtaisen pelitilannekuvansa. Jokainen pelaaja saa vain oman kätensä. Vastustajien piilotettuja laattoja ei koskaan lähetetä muille pelaajille.",
        "Kun huone siirtyy peliin, ennen ensimmäistä huutovuoroa on 10 sekunnin pelinalkulaskuri. Tämä antaa pelaajille aikaa ladata pöytä ennen kuin oikea vuoroajastin alkaa.",
        "Tämä pelinalkulaskuri on erillinen vuorokohtaisesta 10 sekunnin ajastimesta."
      ]
    },
    {
      title: "10 sekunnin vuoroajastin",
      blocks: [
        "Jokaisella ihmisen huudolla tai siirrolla on oma 10 sekunnin palvelimen hallitsema ajastin.",
        "Ajastin alkaa vasta, kun on todella kyseisen ihmispelaajan vuoro. Jos bottien on toimittava ennen seuraavaa ihmistä, palvelin pelaa botit ensin lyhyellä tahdituksen viiveellä ja aloittaa vasta sitten ihmispelaajan 10 sekunnin laskennan. Tämä tarkoittaa, ettei ihmispelaaja menetä aikaa odottaessaan bottien animaatioiden tai bottivuorojen ratkeamista.",
        "Palvelin on ajan auktoriteetti. Asiakas näyttää laskennan, mutta palvelin päättää, saapuiko toiminto ennen määräaikaa.",
        "Jos pelaaja lähettää huudon tai siirron ennen määräaikaa, toiminto tarkistetaan ja hyväksytään vain, jos se on sääntöjenmukainen.",
        "Jos toiminto saapuu määräajan jälkeen, palvelin hylkää sen liian myöhäisenä.",
        "Jos ajastin umpeutuu eikä pelaaja ole toiminut, palvelin ratkaisee vuoron automaattisesti, jotta peli ei koskaan pysähdy:",
        {
          list: [
            "Huutamisen aikana aikakatkaisuhuuto pakotetaan turvalliseen sääntöjenmukaiseen huutoon, yleensä 0.",
            "Laattojen pelaamisen aikana palvelin valitsee ja pelaa kyseiselle pelaajalle sääntöjenmukaisen siirron.",
            "Jos tikki valmistuu aikakatkaisusiirrolla, palvelin ratkaisee tikin voittajan ja vie peliä eteenpäin."
          ]
        },
        "Toistuvat ohitetut vuorot vaikuttavat pelaajan epäaktiivisuustilaan. Ensimmäisen ohitetun vuoron jälkeen pelaaja merkitään varoitustilaan. Toisen jälkeen häntä pidetään epäaktiivisena. Kolmannen jälkeen kyseiselle pelaajalle otetaan käyttöön automaattipeli. Palaava pelaaja voi jatkaa ja poistaa automaattipelin käytöstä saadakseen manuaalisen hallinnan takaisin."
      ]
    },
    {
      title: "Yhteyden katkeamiset ja uudelleenyhdistymiset",
      blocks: [
        "Jos pelaaja katkaisee yhteyden pelin aikana, hänen paikkaansa ei poisteta välittömästi. Peli jatkuu, ja hänen tulevia vuorojaan voi käsitellä aikakatkaisujärjestelmä, jos hän ei palaa ajoissa.",
        "Kun pelaaja yhdistää uudelleen samalla selainidentiteetillä ja uudelleenyhdistymistunnuksella, palvelin palauttaa hänen huoneensa, paikkansa ja yhteystilansa sekä lähettää tuoreen henkilökohtaisen tilannekuvan. Tuo tilannekuva sisältää nykyisen pelitilan ja, jos vuoro on aktiivinen, nykyisen vuoron määräajan.",
        "Jos pelaaja poistuu tarkoituksellisesti aktiivisen pelin aikana, se käsitellään luovutuksena. Hänen paikastaan tulee bottipaikka, pelaaja palautetaan aulaan, eikä hän voi liittyä uudelleen samalle paikalle. Jäljellä olevat pelaajat jatkavat ottelua."
      ]
    },
    {
      title: "Huutaminen ja pelin kulku",
      blocks: [
        "Jokainen kierros alkaa huutamisella. Jokainen pelaaja huutaa kerran ja valitsee, montako 7 tikistä hän odottaa voittavansa. Kelvolliset huudot ovat 0–7.",
        "Kun kaikki huudot on tehty, alkaa pelivaihe. Pelaajat pelaavat yhden dominon tikkiä kohti. Jokaisen tikin voittaja aloittaa seuraavan tikin.",
        "Palvelin tarkistaa jokaisen siirron. Asiakas voi korostaa mahdollisia siirtoja mukavuussyistä, mutta asiakas ei päätä, mikä on sääntöjenmukaista. Palvelin hylkää sääntöjenvastaiset siirrot, väärän pelaajan siirrot, vanhentuneet vuorotunnukset ja myöhästyneet toiminnot."
      ]
    },
    {
      title: "Laattojen säännöt",
      blocks: [
        "Valtit ovat vahvin laattaryhmä. Vahvimmasta heikoimpaan valttijärjestys on:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Ässät ovat:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "Laatalla 0-6 on erityinen kaksoisrooli. Jos se pelataan tai sitä vaaditaan 0:na, se toimii ässänä. Jos se ilmoitetaan 6:na, se toimii tavallisena 6-laattana.",
        "Tikkiä aloittaessaan pelaaja voi aloittaa millä tahansa laatalla. Jos aloituslaatta ei ole valtti tai kaksoislaatta ja siinä on kaksi eri numeroa, pelaajan on ilmoitettava, mitä numeroa pyydetään.",
        "Tikkiä seuratessa:",
        {
          list: [
            "Jos valtti aloitettiin, pelaajien on pelattava valtti, jos sellainen on. Jos heillä on vahvempi valtti kuin tikissä jo oleva vahvin valtti, heidän on pelattava vahvempi valtti.",
            "Jos numeroa pyydettiin, pelaajien on seurattava sitä numeroa ei-valttilaatalla, jos mahdollista.",
            "Jos he eivät voi seurata pyydettyä numeroa, heidän on pelattava valtti, jos sellainen on.",
            "Jos he eivät voi seurata eikä heillä ole valttia, he voivat tiputtaa minkä tahansa laatan."
          ]
        }
      ]
    },
    {
      title: "Pisteytys",
      blocks: [
        "7 tikin jälkeen kierros pisteytetään vertaamalla kunkin pelaajan huutoa hänen todellisuudessa voittamiensa tikkien määrään.",
        {
          list: [
            "Tarkka huuto: 15 pistettä huudettua tikkiä kohti.",
            "Tarkka huuto 7: 105 pistettä plus 50 pisteen bonus.",
            "Enemmän tikkejä kuin huudettu: 5 pistettä voitettua tikkiä kohti.",
            "Vähemmän tikkejä kuin huudettu: -5 pistettä puuttuvaa tikkiä kohti.",
            "Epäonnistunut huuto 7: -50 pistettä."
          ]
        },
        "Kierroksen pisteet lisätään ottelun kokonaispisteisiin. Määritetyn kierrosmäärän jälkeen korkeimman kokonaispistemäärän kerännyt pelaaja voittaa. Tarvittaessa peli käyttää tasaratkaisukriteereitä, jotka perustuvat pisteisiin, huutoon, voitettuihin tikkeihin ja jakajasta laskettavaan istumajärjestykseen."
      ]
    },
    {
      title: "Yksityisyys ja reiluus",
      blocks: [
        "Moninpelipalvelin on auktoritatiivinen. Se omistaa sekoitetun pakan, pelitilan, ajastimien määräajat, sääntöjenmukaisten siirtojen tarkistuksen, pisteytyksen ja kierrosten etenemisen.",
        "Jokainen pelaaja saa vain oman kätensä. Muiden pelaajien piilotettuja laattoja ei sisällytetä heidän tilannekuviinsa. Julkista tietoa ovat huudot, voitetut tikit, kokonaispisteet, nykyinen tikki, valmistuneet tikit, pelaajien tilat ja kunkin pelaajan jäljellä olevien laattojen määrä.",
        "Moninpelin jako luodaan palvelinpuolen siemenestä. Tämä tekee otteluista toistettavia siemenestä ja tapahtumahistoriasta, mikä auttaa reiluustarkastuksissa, uusinnassa, vianetsinnässä ja palautuksessa."
      ]
    },
    {
      title: "Tilastot",
      blocks: [
        "Tilastot lasketaan vain moninpeleistä, joissa kaikki neljä paikkaa ovat neljän eri rekisteröityneen (kirjautuneen) pelaajan hallussa."
      ]
    }
  ]
};
