import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesEs: MpRulesDoc = {
  intro: [
    "Este juego es muy dinámico y requiere un buen conocimiento de las reglas para poder tomar decisiones en poco tiempo. Para practicar se recomienda jugar en el modo de un jugador.",
    "El multijugador de Domino Poker es un juego de mesa en tiempo real con cuatro asientos. Cada partida usa un juego de dominó estándar de doble seis con 28 fichas, repartidas como 7 fichas a cada asiento. La partida pueden jugarla cuatro jugadores humanos o una mezcla de humanos y bots. Una partida solo puede empezar cuando los cuatro asientos están ocupados y al menos un asiento lo ocupa un jugador humano."
  ],
  sections: [
    {
      title: "Salas públicas y privadas",
      blocks: [
        "Los jugadores pueden crear una sala pública o privada.",
        "Las salas públicas están pensadas para ser visibles desde la sala de espera. Otros jugadores pueden encontrarlas en la lista de salas, abrir la vista de la sala, elegir un asiento libre y unirse mientras la sala sigue esperando para empezar.",
        "Las salas privadas están pensadas para jugadores invitados. Tienen el estado de sala y los asientos normales, pero unirse a una sala privada requiere el código de la sala. A una sala privada no se puede acceder simplemente usando su id de sala desde el flujo de la sala de espera pública. El código de la sala se muestra en la vista de la sala y solo debería compartirse con los jugadores que quieras invitar.",
        "Tanto las salas públicas como las privadas admiten las mismas reglas de juego, el mismo sistema de asientos, la misma opción de rellenar con bots y el mismo desarrollo de la partida. La diferencia está en la visibilidad y el acceso: a las salas públicas se puede acceder desde la sala de espera; las privadas requieren el código."
      ]
    },
    {
      title: "Asientos de la sala y controles del anfitrión",
      blocks: [
        "Cada sala tiene exactamente cuatro asientos. El jugador que crea la sala se convierte en el anfitrión y se sienta en el primer asiento. Otros jugadores pueden ocupar los asientos disponibles mientras la sala está esperando.",
        "El anfitrión puede rellenar los asientos vacíos con bots. Esto permite empezar una partida aunque haya menos de cuatro jugadores humanos disponibles. El anfitrión es también el único jugador que puede empezar la partida.",
        "Una partida no puede empezar si algún asiento sigue vacío. Si el anfitrión intenta empezar demasiado pronto, el servidor rechaza el inicio. La regla práctica es sencilla: se requieren cuatro asientos ocupados, humanos o bots.",
        "Si el anfitrión se va mientras la sala sigue esperando, la propiedad del anfitrión pasa a otro jugador humano restante. Si no queda ningún jugador humano en una sala en espera, la sala se destruye."
      ]
    },
    {
      title: "Monedas de oro y salas de pago",
      blocks: [
        "Las salas pueden ser gratuitas o de pago. Al crear una sala, un anfitrión con sesión iniciada puede establecer una cuota de entrada en oro: cualquier cantidad hasta su propio saldo (0 significa una sala gratuita, que funciona exactamente como antes).",
        "Solo los jugadores registrados y con sesión iniciada pueden ocupar un asiento en una sala de pago: tienen un saldo de oro. Los jugadores anónimos no tienen monedero, por lo que no pueden unirse a salas de pago, pero sí pueden unirse a salas gratuitas.",
        "Cada jugador paga la cuota de entrada en el momento de ocupar un asiento, incluido el anfitrión. Solo se puede ocupar un asiento si el saldo cubre la cuota. Las cuotas recaudadas forman el bote del premio de la sala.",
        "Antes de que empiece la partida, el dinero es totalmente reembolsable. Si dejas tu asiento mientras la sala sigue esperando, el anfitrión elimina la sala en espera o la sala caduca antes de empezar, tu cuota de entrada se devuelve a tu saldo.",
        "Una vez que empieza la partida, la cuota de entrada ya no es reembolsable. Irse, rendirse o desconectarse durante la partida no devuelve tu cuota: se queda en el bote para los ganadores.",
        "Cuando termina la partida, el bote se reparte entre los dos mejores jugadores humanos registrados por puntuación total: 70% para el primer puesto y 30% para el segundo. Los bots nunca reciben parte, y los jugadores que se rindieron quedan excluidos. Si solo queda un humano registrado, ese jugador se lleva todo el bote.",
        "Si todos los humanos se van y la partida se abandona sin terminar, no hay ganador, así que el bote no se reparte.",
        "El saldo que ves se actualiza en directo a medida que pagas, recibes un reembolso o ganas el bote. El servidor es siempre la autoridad sobre cada movimiento de monedas."
      ]
    },
    {
      title: "Una sala a la vez",
      blocks: [
        "Un jugador solo puede estar en una sala a la vez. Si un jugador ya ha creado o se ha unido a una sala, el servidor rechazará los intentos de crear otra sala o de unirse a una distinta hasta que ese jugador abandone la sala actual, se rinda en una partida activa, o la partida termine y la sala se limpie.",
        "Esto evita que una misma identidad de navegador ocupe asientos en varias salas a la vez.",
        "Para pruebas locales con varios jugadores humanos en una misma máquina, cada jugador necesita una identidad de navegador independiente, como navegadores distintos o ventanas de incógnito/privadas."
      ]
    },
    {
      title: "Tiempo de vida de la sala y TTL",
      blocks: [
        "Las salas tienen un tiempo de vida de 1 hora desde su creación.",
        "Las salas en espera, iniciándose, terminadas o destruidas se limpian cuando su TTL caduca. La limpieza se ejecuta periódicamente, así que la eliminación puede producirse poco después del momento exacto de caducidad, en lugar de en el milisegundo exacto.",
        "Las salas con una partida activa en curso no se destruyen solo porque pase el TTL original. Si una partida ya está en marcha, se permite que la sala termine. Tras finalizar la partida, el servidor entrega el resultado final y luego destruye la sala para que los jugadores queden libres de crear o unirse a otra sala.",
        "Si todos los jugadores humanos se desconectan de una partida activa, el servidor concede un breve periodo de gracia para reconectar. Si ningún humano regresa durante ese periodo de gracia, la sala abandonada se destruye."
      ]
    },
    {
      title: "Inicio de la partida",
      blocks: [
        "Cuando el anfitrión inicia una sala completa, el servidor crea el estado de juego autoritativo y envía a cada jugador humano sentado su propia instantánea personal de la partida. Cada jugador recibe solo su propia mano. Las fichas ocultas de los oponentes nunca se envían a otros jugadores.",
        "Después de que la sala entra en la partida, hay una cuenta atrás previa de 10 segundos antes de que comience el primer turno de anuncios. Esto da tiempo a los jugadores para cargar la mesa antes de que se inicie el temporizador real del turno.",
        "Esta cuenta atrás previa a la partida es independiente del temporizador de 10 segundos por turno."
      ]
    },
    {
      title: "El temporizador de turno de 10 segundos",
      blocks: [
        "Cada anuncio o jugada de un humano tiene su propio temporizador de 10 segundos controlado por el servidor.",
        "El temporizador empieza solo cuando es realmente el turno de ese jugador humano. Si los bots necesitan actuar antes del siguiente humano, el servidor juega primero los bots, con un breve retardo de ritmo, y solo entonces inicia la cuenta atrás de 10 segundos del jugador humano. Esto significa que un jugador humano no pierde tiempo mientras espera animaciones de bots o que se resuelvan los turnos de los bots.",
        "El servidor es la autoridad del tiempo. El cliente muestra la cuenta atrás, pero el servidor decide si una acción llegó antes del plazo.",
        "Si un jugador envía un anuncio o jugada antes del plazo, la acción se valida y se acepta solo si es legal.",
        "Si la acción llega después del plazo, el servidor la rechaza por llegar demasiado tarde.",
        "Si el temporizador caduca y el jugador no ha actuado, el servidor resuelve el turno automáticamente para que la partida nunca se quede bloqueada:",
        {
          list: [
            "Durante los anuncios, el anuncio por tiempo agotado se fuerza a un anuncio legal seguro, normalmente 0.",
            "Durante el juego de fichas, el servidor elige y juega una jugada legal por ese jugador.",
            "Si una baza se completa con la jugada por tiempo agotado, el servidor resuelve al ganador de la baza y hace avanzar la partida."
          ]
        },
        "Los turnos perdidos repetidos afectan al estado de inactividad del jugador. Tras el primer turno perdido, el jugador se marca con un estado de advertencia. Tras el segundo, se le considera inactivo. Tras el tercero, se activa el juego automático para ese jugador. Un jugador que regresa puede reanudar y desactivar el juego automático para recuperar el control manual."
      ]
    },
    {
      title: "Desconexiones y reconexiones",
      blocks: [
        "Si un jugador se desconecta durante una partida, su asiento no se retira de inmediato. La partida continúa, y sus turnos futuros puede gestionarlos el sistema de tiempo agotado si no regresa a tiempo.",
        "Cuando el jugador se reconecta con la misma identidad de navegador y el mismo token de reconexión, el servidor restaura su sala, su asiento y su estado de conexión, y envía una nueva instantánea personal. Esa instantánea incluye el estado actual de la partida y, si hay un turno activo, el plazo del turno actual.",
        "Si un jugador abandona deliberadamente durante una partida activa, se trata como una rendición. Su asiento se convierte en un asiento de bot, el jugador vuelve a la sala de espera y no puede volver a ocupar ese mismo asiento. Los jugadores restantes continúan la partida."
      ]
    },
    {
      title: "Anuncios y desarrollo del juego",
      blocks: [
        "Cada ronda empieza con los anuncios. Cada jugador anuncia una vez, eligiendo cuántas de las 7 bazas espera ganar. Los anuncios válidos son de 0 a 7.",
        "Después de que se hayan hecho todos los anuncios, empieza la fase de juego. Los jugadores juegan un dominó por baza. El ganador de cada baza inicia la siguiente.",
        "El servidor valida cada jugada. El cliente puede resaltar las jugadas posibles por comodidad, pero el cliente no decide qué es legal. El servidor rechaza las jugadas ilegales, las jugadas del jugador equivocado, los ids de turno obsoletos y las acciones tardías."
      ]
    },
    {
      title: "Reglas de las fichas",
      blocks: [
        "Los triunfos son el grupo de fichas más fuerte. De más fuerte a más débil, el orden de los triunfos es:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Los ases son:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "La ficha 0-6 tiene un papel dual especial. Si se juega o se requiere como 0, se comporta como un as. Si se declara como 6, se comporta como una ficha 6 normal.",
        "Al abrir una baza, un jugador puede abrir con cualquier ficha. Si la ficha abierta no es un triunfo ni un doble, y tiene dos números diferentes, el jugador debe declarar qué número se solicita.",
        "Al seguir una baza:",
        {
          list: [
            "Si se abrió con triunfo, los jugadores deben jugar triunfo si tienen uno. Si tienen un triunfo más fuerte que el triunfo más fuerte que ya hay en la baza, deben jugar un triunfo más fuerte.",
            "Si se solicitó un número, los jugadores deben seguir ese número con una ficha que no sea triunfo si es posible.",
            "Si no pueden seguir el número solicitado, deben jugar triunfo si tienen uno.",
            "Si no pueden seguir y no tienen triunfo, pueden descartar cualquier ficha."
          ]
        }
      ]
    },
    {
      title: "Puntuación",
      blocks: [
        "Después de 7 bazas, la ronda se puntúa comparando el anuncio de cada jugador con el número de bazas que ganó realmente.",
        {
          list: [
            "Anuncio exacto: 15 puntos por baza anunciada.",
            "Anuncio exacto de 7: 105 puntos más una bonificación de 50 puntos.",
            "Más bazas de las anunciadas: 5 puntos por baza ganada.",
            "Menos bazas de las anunciadas: -5 puntos por baza que falte.",
            "Anuncio de 7 fallido: -50 puntos."
          ]
        },
        "Las puntuaciones de la ronda se suman al total de la partida. Tras el número configurado de rondas, gana el jugador con la puntuación total más alta. Si es necesario, la partida usa criterios de desempate basados en la puntuación, el anuncio, las bazas ganadas y el orden de asiento desde el repartidor."
      ]
    },
    {
      title: "Privacidad y equidad",
      blocks: [
        "El servidor multijugador es autoritativo. Posee la baraja barajada, el estado de la partida, los plazos del temporizador, la validación de jugadas legales, la puntuación y el avance de las rondas.",
        "Cada jugador recibe solo su propia mano. Las fichas ocultas de los demás jugadores no se incluyen en sus instantáneas. La información pública incluye los anuncios, las bazas ganadas, las puntuaciones totales, la baza actual, las bazas completadas, los estados de los jugadores y el número de fichas restantes de cada jugador.",
        "El reparto multijugador se genera a partir de una semilla del lado del servidor. Esto hace que las partidas sean reproducibles a partir de la semilla y el historial de eventos, lo que ayuda con las comprobaciones de equidad, la repetición, la depuración y la recuperación."
      ]
    },
    {
      title: "Estadísticas",
      blocks: [
        "Las estadísticas se cuentan solo en partidas multijugador donde los cuatro asientos están ocupados por cuatro jugadores registrados (con sesión iniciada) distintos."
      ]
    }
  ]
};
