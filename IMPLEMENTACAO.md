# Implementação do balanceamento 2.0.0

As regras propostas no relatório foram implementadas: ondas com orçamento e descanso seguro, apresentação gradual, limite de atiradores, escudo azul, reparação verde limitada, supressão amarela, bônus defensivo de cadeia e explosão do foguete na interceptação. Mantidos os ataques comuns de todas as cores.

A interface inclui tutorial jogável, prévia da torre, HUD dos poderes, avisos de dano/ondas, motivo correto da derrota, resumo de desempenho, seleção de dificuldade e repetição de semente. Controles de toque funcionam em tablets e o layout de celular reserva espaço para o campo e os comandos. Pausa automática evita que a partida prossiga ao perder foco.

Diagnósticos locais exportáveis incluem entradas para reprodução. As fontes aleatórias foram separadas e a configuração ganhou versão e perfis. O núcleo real é carregável em Node para testar sem uma cópia da implementação.

## Validação

- Testes Node: cargas e impactos simultâneos, contato/sabotagem, limites de reparação, supressão, foguetes, orçamento/limites das ondas, cadência, pausa/reinício, prévia/diamante, independência aleatória, tutorial, causas de derrota, cascatas e replay.
- Smoke Chromium em desktop 1280×1000, celular 390×844 e tablet 900×1100: tutorial, HUD, pausa explícita/automática, dificuldade, ausência de overflow horizontal e erros JavaScript.
- Captura de celular inspecionada; controles verificados dentro da altura disponível.

## Limites e decisões

Os valores são uma primeira versão calibrável. Não há alegação de duração média, taxa de vitória ou diversão validada por pessoas. A rodada com 6–10 jogadores depende de recrutamento externo e permanece uma etapa de produto.

Não foram adicionados chefes, novas cores, árvore de upgrades ou escolha de melhorias entre ondas: eram possibilidades futuras condicionadas à estabilização, não recomendações para esta primeira implementação. Não se acrescentou mira teleguiada ou reserva de dano de salvas anteriores sem métricas que justifiquem essa complexidade.

Os fontes TypeScript e o build original não estão disponíveis no checkout. Foi mantido o JavaScript existente com configuração extraída e ponto de entrada testável; não foi inventado um processo de compilação. O relatório original continua sendo um retrato da versão anterior.

## Correção de layout por altura de janela

O layout anterior empilhava indicadores e campo, excedendo a altura útil de notebooks. Agora a página usa a altura dinâmica da janela: painel lateral no desktop/paisagem, indicadores compactos no celular em pé e campo dimensionado no espaço restante por ResizeObserver. A proporção lógica 420×548 permanece; a resolução de desenho acompanha o tamanho exibido e a densidade de pixels (até 2×). Menus longos têm rolagem interna, sem deslocar o jogo inteiro.

A verificação de navegador cobre 1920×1080, 1366×650, 1280×600, 390×844, 320×568, 844×390 e 900×1100. Verifica limites verticais e horizontais, visibilidade dos indicadores/campo/pausa/toque e proporção do canvas, além dos fluxos existentes. Redimensionamento durante a partida também é exercitado. São viewports emulados; aparelhos físicos não foram testados.
