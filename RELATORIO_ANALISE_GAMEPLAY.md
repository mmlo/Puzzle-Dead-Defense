# Puzzle Dead Defense — análise técnica e recomendações

Data: 27/09/2026. Escopo: `game.js` e `index.html` disponíveis neste checkout.

## Parecer executivo

O conceito tem uma ligação interessante entre planejamento e urgência: resolver o puzzle produz a defesa da base. Cores, cascatas e inimigos diferentes já oferecem uma base para decisões táticas. Minha recomendação é preservar esse núcleo e priorizar previsibilidade, margem de reação e identidade das cores antes de ampliar o catálogo de poderes.

A dificuldade dos atiradores tem fundamento no código. Eles combinam dano recorrente, permanência em campo, dois pontos de vida e possibilidade de absorver munição através de seus projéteis. Não existe escudo ou recuperação de vida. A prioridade automática de mira já existe, mas não garante que os disparos atinjam o alvo escolhido.

**Recomendação principal:** introduzir os atiradores gradualmente, limitar sua simultaneidade nas primeiras fases e experimentar um escudo azul que armazene proteção por acertos. Testar cada mudança separadamente antes de combinar todas.

## Evidência e limites

Foi feita leitura do código e execução de cenários controlados em Node.js usando as funções reais da simulação. Para executá-las, o trecho de inicialização do DOM foi removido apenas em memória e as funções foram expostas em um contexto isolado. O jogo não foi alterado.

Não houve sessão interativa em navegador, avaliação visual em aparelhos reais ou teste com jogadores. Portanto, as causas mecânicas abaixo são verificáveis; a intensidade da frustração, a duração ideal da partida e os números propostos ainda precisam de validação humana. Não há telemetria disponível para afirmar a porcentagem de mortes causada por atiradores.

| Cenário controlado | Resultado observado |
|---|---|
| 1 atirador parado em x=292, base com 10 HP, sem defesa nem novos inimigos | Derrota em 21,30 s |
| 2 atiradores nas mesmas condições, ataques sincronizados | Derrota em 11,22 s |
| 3 atiradores nas mesmas condições | Derrota em 9,20 s |
| Foguete cruzando um projétil inimigo | Ambos removidos; efeito de raio 16, sem explosão ofensiva de raio 70 |
| Temporizador de geração isolado, passo de 1/60 s | Intervalo mínimo atingido após 140 gerações, em 155,40 s |

Esses tempos dos atiradores começam com os inimigos já posicionados, não no início da partida. Os testes não representam a sobrevivência de um jogador e não incluem o tempo de aproximação.

## Diagnóstico priorizado

### 1. Atiradores acumulam pressão sem prazo de término — prioridade alta

Em `game.js:1103`, o atirador para em x≤292 e dispara a cada 2 s. Cada projétil que chega à base causa 1 de dano. Ao contrário do inimigo de contato, ele não desaparece ao causar dano: continua até ser eliminado. Não há limite de atiradores ativos.

Um atirador gera aproximadamente 0,5 dano/s enquanto permanece disparando. O primeiro impacto, contado desde seu surgimento em x=428, ocorre aproximadamente entre 8,8 e 14,5 s, dependendo da velocidade e da discretização. O jogador precisa conseguir formar uma resposta nesse intervalo enquanto administra o tabuleiro.

Os pesos de geração são fixos desde o começo (`game.js:30`): normal 40%, corredor 20%, tanque 15%, atirador 15%, sabotador 10%. Assim, o primeiro inimigo já pode ser um atirador. Nos primeiros dez sorteios, a probabilidade teórica de pelo menos um atirador é `1 − 0,85^10 ≈ 80,3%`.

### 2. Priorizar o alvo não garante neutralizá-lo — prioridade alta

`planVolley` (`game.js:408`) planeja os tiros usando HP virtual. Entretanto, a colisão real usa o primeiro inimigo sobreposto à trajetória, não o `targetId`. Inimigos à frente e projéteis podem consumir os disparos. O planejamento também não desconta o dano de salvas anteriores ainda em voo.

O caso do foguete merece atenção: ao atingir um tiro inimigo, ele desaparece sem causar sua explosão ofensiva. Isso permite gastar cinco gemas vermelhas por uma interceptação simples. É uma regra possível, mas reduz a confiabilidade do especial exatamente no confronto em que o jogador precisa dele.

Recomendo que foguetes explodam no ponto de interceptação, usando a regra normal de dano em área. A explosão não deve atingir automaticamente um atirador distante. Para os tiros comuns, manter inicialmente a interceptação e medir desperdício antes de introduzir perfuração ou perseguição de alvos.

### 3. A progressão acelera mais que as ferramentas de defesa — prioridade alta

O intervalo cai de 1,8 s para 0,4 s: a taxa cresce de aproximadamente 33 para 150 inimigos/minuto, um aumento de 4,5 vezes. O limite chega em cerca de 2min35s se a partida continuar ativa.

Com a composição atual, cada inimigo tem em média 1,45 HP. Isso representa aproximadamente 0,81 HP inimigo/s no início e 3,63 no limite, antes de considerar tiros interceptados ou desperdiçados. É uma estimativa de demanda ofensiva, não uma taxa obrigatória de disparos: foguetes podem atingir vários inimigos.

A chance de gema crash ajuda parcialmente, subindo de 20% para aproximadamente 31,7%. A queda normal continua em 600 ms por célula. A pressão cresce continuamente, sem descanso, ondas ou apresentação gradual das ameaças.

### 4. Há pouca escolha defensiva e poucas recompensas por cor — prioridade média

Cada gema eliminada produz um tiro; cinco vermelhas acrescentam um foguete (`game.js:1007`). Verde, azul e amarelo não têm funções especiais. Isso favorece o vermelho quando as demais condições são equivalentes, embora geometria, espaço e cadeias ainda importem.

As cadeias multiplicam pontos, mas não o dano por gema. Preparar uma cadeia maior pode aumentar o risco de ficar sem ataques imediatos sem oferecer uma recompensa militar proporcional. O diamante chega a cada 30 torres; sua disponibilidade depende da velocidade de colocação, não do tempo de combate.

### 5. Clareza e diagnóstico de derrota precisam melhorar — prioridade média

Existe indicador circular de carga no atirador, o que é positivo. Falta destacar o primeiro aparecimento, explicar a interceptação e tornar evidente a origem do dano na base.

O encerramento sempre informa “A base caiu”, inclusive quando a causa é bloqueio do tabuleiro. Recomendo diferenciar “Base destruída” de “Tabuleiro bloqueado” e mostrar duração, causa, dano por tipo e maior cadeia.

Também recomendo prévia da próxima torre, tutorial curto com uma combinação guiada e pausa automática ao perder foco. Hoje o código limpa comandos ao ocultar a página, mas não muda explicitamente a fase para pausa. Os controles de toque são ocultados a partir de 768 px: um tablet largo pode ficar sem eles; usar capacidade de toque ou uma preferência visível.

## Escudo recomendado: barreira azul por cargas

O escudo deve comprar tempo para resolver o puzzle e eliminar a ameaça. Uma barreira de duração fixa pode ser desperdiçada entre ataques; cargas armazenadas tornam o benefício mais compreensível.

Proposta inicial de experimento:

| Regra | Valor inicial proposto |
|---|---|
| Recurso | Gemas azuis eliminadas, acumuladas entre jogadas |
| Recarga | 4 azuis concedem 1 carga |
| Capacidade | 3 cargas |
| Proteção | Cada carga bloqueia 1 projétil inimigo que chegaria à base |
| Ativação | Automática no impacto; sem botão extra |
| Limite | Não bloqueia contato nem sabotagem |
| Ataque | Azuis continuam produzindo seus tiros comuns |
| Estado inicial | 1 carga para aprendizagem; avaliar 0 em dificuldade avançada |

Ao chegar à capacidade máxima, descartar o excedente de energia, evitando estoque invisível. Exibir claramente cargas e progresso de recarga. Aplicar a proteção antes de descontar HP; múltiplos impactos consomem cargas individualmente. Pausa congela todos os efeitos e reinício limpa o estado.

Risco: tornar azul obrigatório ou permitir defesa sustentável sem eliminar atiradores. A quatro azuis por carga, um atirador exige aproximadamente duas azuis eliminadas/s para ser neutralizado indefinidamente apenas pelo escudo. Medir a produção real de azuis antes de fechar esse custo. Não adicionar regeneração passiva na primeira versão.

## Ajustes da dificuldade para experimentar

Todos os números desta seção são hipóteses de design, não valores validados.

1. Reservar os primeiros 30–45 s para normais e introdução de corredores. Apresentar tanque, atirador e sabotador separadamente, com aviso curto e sem interromper repetidamente o jogo.
2. Na introdução dos atiradores, limitar a um ativo; liberar dois somente numa fase posterior. Quando o limite estiver ocupado, selecionar outro tipo elegível com pesos normalizados.
3. Experimentar 3 s entre disparos e 3 s antes do primeiro tiro após parar. Manter inicialmente os 2 HP para não alterar simultaneamente todos os eixos de dificuldade.
4. Testar intervalo mínimo de geração de 0,8–1,0 s na dificuldade padrão. Medir sobrevivência e ocupação do campo antes de recuperar o limite de 0,4 s em um modo avançado.
5. Depois dessa rodada, substituir a aceleração contínua por ondas com orçamento de ameaça e pequenos intervalos de recuperação. Atiradores devem consumir mais orçamento por sua pressão recorrente, além do limite de simultaneidade.

Não aplicar todos os ajustes de uma vez no experimento inicial: isso impede descobrir qual deles resolveu o problema e pode deixar o jogo excessivamente fácil.

## Poderes e evolução do conceito

| Cor/recurso | Papel sugerido | Ordem e cuidado |
|---|---|---|
| Vermelho | Explosão e dano em área | Preservar; tornar a interceptação do foguete consistente |
| Azul | Escudo contra projéteis | Primeiro poder novo; avaliar custo e teto |
| Verde | Reparação limitada da base | Depois do escudo; exemplo: 10 verdes por 1 HP, máximo 10 HP e limite por onda |
| Amarelo | Supressão temporária | Depois; exemplo: reduzir movimento e carga de disparo por 2 s, sem empilhar intensidade |
| Cadeias | Pequeno bônus de energia defensiva | Avaliar após o azul; limitar por resolução para evitar multiplicação explosiva |
| Diamante | Limpeza estratégica do tabuleiro | Preservar inicialmente; explicar como escolhe a cor em contatos múltiplos |

A proposta amarela precisa afetar também a carga de disparo: desacelerar apenas movimento não responde ao atirador já parado. Reparação verde exige cuidado porque vida recuperada somada a escudo pode remover a consequência dos erros.

Evitaria agora novas cores, árvore extensa de upgrades, chefes e poderes com vários botões. A profundidade pode vir primeiro das quatro cores existentes e de escolhas claras entre dano, proteção e controle. Após estabilizar isso, uma escolha entre duas melhorias ao final de certas ondas pode dar variedade às partidas.

## Engenharia e plano de validação

O JavaScript apresenta regiões com nomes de arquivos TypeScript, mas esses fontes, manifesto de dependências e testes não estão no checkout. Antes de uma implementação grande, recuperar a origem/build, se existirem, ou organizar módulos equivalentes preservando o comportamento atual.

Pontos positivos a manter: passo fixo de simulação, gerador pseudoaleatório com semente, lógica de puzzle separada por funções, preocupação com colisão durante deslocamento, símbolos além das cores e tratamento de movimento reduzido.

Separar parâmetros em uma configuração de balanceamento e registrar a versão junto à semente. Hoje puzzle, inimigos e dispersão compartilham o mesmo gerador: mudar uma jogada ou poder altera os sorteios seguintes. Para comparações justas entre versões, separar fluxos aleatórios e registrar entradas com o passo de simulação. A semente sozinha não reproduz as decisões do jogador; o botão de reinício também escolhe outra semente.

Plano sugerido:

1. Registrar referência atual: tempo de sobrevivência, motivo da derrota, dano por origem, atiradores simultâneos, gemas eliminadas/s, tiros úteis, foguetes interceptados e ocupação do tabuleiro.
2. Comparar versão atual, ajuste de atiradores, escudo isolado e combinação dos dois. Usar cenários fixos de combate e sessões humanas; simuladores ajudam a comparar versões, mas não demonstram diversão. Essa distinção também é tratada em pesquisa sobre [avaliação de balanceamento por agentes](https://arxiv.org/abs/2304.08699).
3. Fazer uma rodada exploratória com 6–10 pessoas de familiaridades diferentes, incluindo teclado e toque, alternando a ordem das versões. Isso detecta problemas de usabilidade; não sustenta conclusões estatísticas amplas.
4. Verificar se o jogador entende a ameaça, consegue preparar uma resposta e explica a própria derrota. Comparar mediana e dispersão de sobrevivência e dano, não apenas recorde ou média.
5. Só então definir duração desejada, perfis de dificuldade e números finais. Uma meta provisória de produto poderia ser partidas padrão de 3–5 minutos, a confirmar com o público pretendido.

Critérios técnicos para o futuro escudo: uma carga bloqueia exatamente um impacto; três cargas não bloqueiam quatro impactos; contato continua causando dano; o teto não é ultrapassado; pausa e reinício preservam suas regras; HUD e simulação concordam. Para o foguete, testar interceptação, dano por distância e ausência de dano duplicado.

## Sequência recomendada de trabalho

**Primeira entrega:** instrumentação, causa correta de derrota e cenários reproduzíveis. Isso estabelece uma referência confiável.

**Segunda entrega:** introdução e limite de atiradores, cadência configurável e regra explícita de interceptação do foguete. Comparar com a referência.

**Terceira entrega:** escudo azul por cargas, feedback visual e comparação das variantes. Validar especialmente se o jogador ganhou tempo para reagir.

**Quarta entrega:** prévia de peças, tutorial, ondas e ajustes de acessibilidade. Introduzir verde e amarelo um por vez quando a economia de combate estiver estável.

O objetivo de aprovação é que uma derrota seja compreensível e responda às decisões do jogador, e que sobreviver continue exigindo resolver bem o puzzle. Não basta aumentar a duração da partida.
