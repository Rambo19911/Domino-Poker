import type { MpRulesDoc } from "../../mpRulesContent";

export const mpRulesPt: MpRulesDoc = {
  intro: [
    "Este jogo é muito dinâmico e exige um bom conhecimento das regras para poder tomar decisões em pouco tempo. Para treinar, recomenda-se jogar no modo de um jogador.",
    "O multijogador do Domino Poker é um jogo de mesa em tempo real com quatro lugares. Cada partida usa um conjunto de dominó padrão de duplo seis com 28 peças, distribuídas como 7 peças a cada lugar. A partida pode ser jogada por quatro jogadores humanos ou por uma mistura de humanos e bots. Uma partida só pode começar quando os quatro lugares estiverem ocupados e pelo menos um lugar estiver ocupado por um jogador humano."
  ],
  sections: [
    {
      title: "Salas públicas e privadas",
      blocks: [
        "Os jogadores podem criar uma sala pública ou privada.",
        "As salas públicas destinam-se a ser descobertas a partir do saguão. Outros jogadores podem encontrá-las na lista de salas, abrir a vista da sala, escolher um lugar livre e entrar enquanto a sala ainda está à espera de começar.",
        "As salas privadas destinam-se a jogadores convidados. Continuam a ter o estado e os lugares normais de uma sala, mas entrar numa sala privada requer o código da sala. Não é possível entrar numa sala privada apenas usando o seu id de sala a partir do fluxo do saguão público. O código da sala é mostrado na vista da sala e só deve ser partilhado com os jogadores que queres convidar.",
        "Tanto as salas públicas como as privadas suportam as mesmas regras de jogo, o mesmo sistema de lugares, a mesma opção de preenchimento com bots e o mesmo fluxo de partida. A diferença está na possibilidade de descoberta e no acesso de entrada: às salas públicas pode-se entrar a partir do saguão; as privadas requerem o código."
      ]
    },
    {
      title: "Lugares da sala e controlos do anfitrião",
      blocks: [
        "Cada sala tem exatamente quatro lugares. O jogador que cria a sala torna-se o anfitrião e é colocado no primeiro lugar. Outros jogadores podem ocupar os lugares disponíveis enquanto a sala está à espera.",
        "O anfitrião pode preencher os lugares vazios com bots. Isto permite iniciar um jogo mesmo que estejam disponíveis menos de quatro jogadores humanos. O anfitrião é também o único jogador que pode iniciar o jogo.",
        "Um jogo não pode começar se algum lugar ainda estiver vazio. Se o anfitrião tentar iniciar demasiado cedo, o servidor rejeita o início. A regra prática é simples: são necessários quatro lugares ocupados, por humanos ou bots.",
        "Se o anfitrião sair enquanto a sala ainda está à espera, o papel de anfitrião passa para outro jogador humano restante. Se não restar nenhum jogador humano numa sala em espera, a sala é destruída."
      ]
    },
    {
      title: "Moedas de ouro e salas pagas",
      blocks: [
        "As salas podem ser gratuitas ou pagas. Ao criar uma sala, um anfitrião com sessão iniciada pode definir uma taxa de entrada em ouro — qualquer valor até ao seu próprio saldo (0 significa uma sala gratuita, que se comporta exatamente como antes).",
        "Só jogadores registados e com sessão iniciada podem ocupar um lugar numa sala paga: têm um saldo de ouro. Os jogadores anónimos não têm carteira, por isso não podem entrar em salas pagas, mas podem mesmo assim entrar em salas gratuitas.",
        "Cada jogador paga a taxa de entrada no momento em que ocupa um lugar, incluindo o anfitrião. Um lugar só pode ser ocupado se o saldo cobrir a taxa. As taxas recolhidas formam o pote de prémio da sala.",
        "Antes de o jogo começar, o dinheiro é totalmente reembolsável. Se deixares o teu lugar enquanto a sala ainda está à espera, se o anfitrião eliminar a sala em espera ou se a sala expirar antes de começar, a tua taxa de entrada é devolvida ao teu saldo.",
        "Assim que o jogo começa, a taxa de entrada deixa de ser reembolsável. Sair, desistir ou desligar durante a partida não devolve a tua taxa — ela fica no pote para os vencedores.",
        "Quando a partida termina, o pote é dividido entre os dois melhores jogadores humanos registados por pontuação total: 70% para o primeiro lugar e 30% para o segundo. Os bots nunca recebem uma parte, e os jogadores que desistiram ficam excluídos. Se restar apenas um humano registado, esse jogador leva todo o pote.",
        "Se todos os humanos saírem e a partida for abandonada sem terminar, não há vencedor, por isso o pote não é pago.",
        "O saldo que vês atualiza-se em tempo real à medida que pagas, recebes reembolso ou ganhas o pote. O servidor é sempre a autoridade sobre cada movimento de moedas."
      ]
    },
    {
      title: "Uma sala de cada vez",
      blocks: [
        "Um jogador só pode estar numa sala de cada vez. Se um jogador já criou ou entrou numa sala, o servidor recusará as tentativas de criar outra sala ou entrar numa diferente até que esse jogador saia da sala atual, desista de um jogo ativo ou o jogo termine e a sala seja limpa.",
        "Isto impede que uma única identidade de navegador ocupe lugares em várias salas ao mesmo tempo.",
        "Para testes locais com vários jogadores humanos numa mesma máquina, cada jogador precisa de uma identidade de navegador separada, como navegadores diferentes ou janelas de navegação anónima/privada."
      ]
    },
    {
      title: "Tempo de vida da sala e TTL",
      blocks: [
        "As salas têm um tempo de vida (TTL) de 1 hora a partir da criação.",
        "As salas em espera, a iniciar, terminadas ou destruídas são limpas depois de o seu TTL expirar. A limpeza corre periodicamente, por isso a remoção pode acontecer pouco depois do momento exato de expiração, e não no milissegundo exato.",
        "As salas ativas em jogo não são destruídas só porque o TTL original passou. Se uma partida já está em curso, a sala pode terminar. Depois de o jogo terminar, o servidor entrega o resultado final do jogo e depois destrói a sala, para que os jogadores fiquem livres de criar ou entrar noutra sala.",
        "Se todos os jogadores humanos se desligarem de um jogo ativo, o servidor concede um curto período de tolerância para reconexão. Se nenhum humano regressar durante esse período, a sala abandonada é destruída."
      ]
    },
    {
      title: "Iniciar o jogo",
      blocks: [
        "Quando o anfitrião inicia uma sala cheia, o servidor cria o estado de jogo autoritativo e envia a cada jogador humano sentado o seu próprio retrato pessoal do jogo. Cada jogador recebe apenas a sua própria mão. As peças escondidas dos adversários nunca são enviadas a outros jogadores.",
        "Depois de a sala entrar no jogo, há uma contagem decrescente de 10 segundos antes de começar o primeiro turno de aposta. Isto dá aos jogadores tempo para carregar a mesa antes de começar o verdadeiro temporizador de turno.",
        "Esta contagem decrescente pré-jogo é separada do temporizador de 10 segundos por turno."
      ]
    },
    {
      title: "O temporizador de turno de 10 segundos",
      blocks: [
        "Cada aposta ou jogada humana tem o seu próprio temporizador de 10 segundos controlado pelo servidor.",
        "O temporizador só começa quando é realmente a vez desse jogador humano. Se forem precisos bots a agir antes do próximo humano, o servidor joga primeiro os bots, com um pequeno atraso de ritmo, e só então inicia a contagem decrescente de 10 segundos do jogador humano. Isto significa que um jogador humano não perde tempo enquanto espera por animações de bots ou pela resolução dos turnos dos bots.",
        "O servidor é a autoridade do tempo. O cliente mostra a contagem decrescente, mas o servidor decide se uma ação chegou antes do prazo.",
        "Se um jogador submeter uma aposta ou jogada antes do prazo, a ação é validada e só é aceite se for legal.",
        "Se a ação chegar depois do prazo, o servidor rejeita-a por ser demasiado tardia.",
        "Se o temporizador expirar e o jogador não tiver agido, o servidor resolve automaticamente o turno para que o jogo nunca pare:",
        {
          list: [
            "Durante a aposta, a aposta por tempo esgotado é forçada para uma aposta legal segura, normalmente 0.",
            "Durante a jogada de peças, o servidor escolhe e joga uma jogada legal por esse jogador.",
            "Se uma vaza for concluída pela jogada por tempo esgotado, o servidor resolve o vencedor da vaza e faz o jogo avançar."
          ]
        },
        "Turnos repetidamente falhados afetam o estado de inatividade do jogador. Após o primeiro turno falhado, o jogador é marcado com um estado de aviso. Após o segundo, é considerado inativo. Após o terceiro, é ativado o jogo automático para esse jogador. Um jogador que regresse pode retomar e desativar o jogo automático para recuperar o controlo manual."
      ]
    },
    {
      title: "Desconexões e reconexões",
      blocks: [
        "Se um jogador se desligar durante um jogo, o seu lugar não é removido imediatamente. O jogo continua, e os seus turnos futuros podem ser tratados pelo sistema de tempo esgotado se não regressar a tempo.",
        "Quando o jogador se reconecta com a mesma identidade de navegador e o mesmo token de reconexão, o servidor restaura a sua sala, lugar e estado de ligação, e envia um novo retrato pessoal. Esse retrato inclui o estado atual do jogo e, se houver um turno ativo, o prazo do turno atual.",
        "Se um jogador sair deliberadamente durante um jogo ativo, isso é tratado como uma desistência. O seu lugar passa a ser um lugar de bot, o jogador é devolvido ao saguão e não pode voltar a ocupar esse mesmo lugar. Os restantes jogadores continuam a partida."
      ]
    },
    {
      title: "Apostas e jogabilidade",
      blocks: [
        "Cada mão começa com a aposta. Cada jogador aposta uma vez, escolhendo quantas das 7 vazas espera ganhar. As apostas válidas vão de 0 a 7.",
        "Depois de todas as apostas estarem feitas, começa a fase de jogo. Os jogadores jogam um dominó por vaza. O vencedor de cada vaza sai na vaza seguinte.",
        "O servidor valida cada jogada. Um cliente pode destacar jogadas possíveis por conveniência, mas o cliente não decide o que é legal. O servidor rejeita jogadas ilegais, jogadas do jogador errado, ids de turno desatualizados e ações tardias."
      ]
    },
    {
      title: "Regras das peças",
      blocks: [
        "Os trunfos são o grupo de peças mais forte. Do mais alto ao mais baixo, a ordem dos trunfos é:",
        "0-0, 1-1, 1-6, 1-5, 1-4, 1-3, 1-2, 1-0.",
        "Os ases são:",
        "6-6, 5-5, 4-4, 3-3, 2-2, 0-6.",
        "A peça 0-6 tem um papel duplo especial. Se for jogada ou exigida como 0, comporta-se como um ás. Se for declarada como 6, comporta-se como uma peça 6 normal.",
        "Ao sair numa vaza, um jogador pode sair com qualquer peça. Se a peça de saída não for um trunfo nem um duplo, e tiver dois números diferentes, o jogador tem de declarar qual o número que está a ser pedido.",
        "Ao seguir numa vaza:",
        {
          list: [
            "Se saiu um trunfo, os jogadores têm de jogar trunfo se tiverem um. Se tiverem um trunfo mais forte do que o trunfo mais forte já presente na vaza, têm de jogar um trunfo mais forte.",
            "Se foi pedido um número, os jogadores têm de seguir esse número com uma peça que não seja trunfo, se possível.",
            "Se não conseguirem seguir o número pedido, têm de jogar trunfo se tiverem um.",
            "Se não conseguirem seguir e não tiverem trunfo, podem descartar qualquer peça."
          ]
        }
      ]
    },
    {
      title: "Pontuação",
      blocks: [
        "Depois de 7 vazas, a mão é pontuada comparando a aposta de cada jogador com o número de vazas que efetivamente ganhou.",
        {
          list: [
            "Aposta exata: 15 pontos por vaza apostada.",
            "Aposta exata de 7: 105 pontos mais um bónus de 50 pontos.",
            "Mais vazas do que o apostado: 5 pontos por vaza ganha.",
            "Menos vazas do que o apostado: -5 pontos por cada vaza em falta.",
            "Aposta de 7 falhada: -50 pontos."
          ]
        },
        "As pontuações da mão são somadas ao total da partida. Após o número configurado de mãos, vence o jogador com a maior pontuação total. Se necessário, o jogo usa critérios de desempate baseados na pontuação, na aposta, nas vazas ganhas e na ordem dos lugares a partir do distribuidor."
      ]
    },
    {
      title: "Privacidade e justiça",
      blocks: [
        "O servidor multijogador é autoritativo. É dono do baralho baralhado, do estado do jogo, dos prazos do temporizador, da validação de jogadas legais, da pontuação e da progressão das mãos.",
        "Cada jogador recebe apenas a sua própria mão. As peças escondidas dos outros jogadores não são incluídas nos seus retratos. A informação pública inclui as apostas, as vazas ganhas, as pontuações totais, a vaza atual, as vazas concluídas, os estados dos jogadores e o número de peças restantes de cada jogador.",
        "A distribuição do multijogador é gerada a partir de uma semente do lado do servidor. Isto torna as partidas reproduzíveis a partir da semente e do histórico de eventos, o que ajuda nas verificações de justiça, na repetição, na depuração e na recuperação."
      ]
    },
    {
      title: "Estatísticas",
      blocks: [
        "As estatísticas contam apenas em jogos multijogador em que os quatro lugares são ocupados por quatro jogadores registados (com sessão iniciada) distintos."
      ]
    }
  ]
};
