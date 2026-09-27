# Puzzle Dead Defense

Puzzle de gemas com defesa em tempo real, em HTML/Canvas e JavaScript sem dependências de execução.

## Jogar

Abra `index.html` no navegador ou sirva esta pasta com um servidor estático (por exemplo, `python3 -m http.server 8080`).

Setas/A/D movem, cima/Z/X gira, baixo acelera e Espaço solta. Esc/P pausa; M alterna áudio. Controles de toque aparecem em aparelhos de ponteiro grosso, incluindo tablets. Ao perder foco, a partida pausa e exige retomada explícita.

Comece por **Treinar combinação azul**. Grupos ortogonais de quatro gemas são eliminados; uma gema com anel permite grupos de duas. A prévia mostra a próxima torre de cima para baixo. Cada gema eliminada dispara um tiro.

| Recurso | Efeito automático |
|---|---|
| 5 vermelhas | Foguete: 2 de dano num raio de 70, inclusive ao interceptar projéteis |
| 4 azuis | +1 carga de escudo, máximo 3; cada uma bloqueia um disparo inimigo |
| 10 verdes | +1 HP, até 10 HP e dois reparos por onda |
| 6 amarelas | Reduz movimento e carregamento inimigo em 50% por 2 segundos |
| Cadeia de 2 ou mais | +1 energia azul por resolução |
| Cada 30 torres | Diamante limpa uma cor vizinha; mais contatos, depois quantidade no tabuleiro e ordem vermelho/verde/azul/amarelo resolvem empates |

Escudo não protege de contato/sabotagem. Energia excedente é descartada no teto de escudo e reparo. Supressão renova até dois segundos sem acumular intensidade ou duração adicional.

## Ondas e dificuldades

Normais aparecem na onda 1, corredores na 2, tanques na 3, atiradores na 4 e sabotadores na 5. Atiradores carregam por três segundos, limitados a um simultâneo nas ondas 4–5 e dois a partir da 6. O orçamento ponderado limita cada onda; a geração encerra em 30 segundos ou quando o orçamento acaba. Inimigos restantes precisam ser resolvidos antes dos seis segundos de recuperação. Não há remoção automática de ameaças.

Padrão começa com um escudo e intervalo de geração de 1,8 s, com piso de 0,9 s. Avançado começa sem escudo, em 1,5 s, com piso de 0,6 s. Recordes são separados por dificuldade e por esta geração de balanceamento; os registros antigos permanecem no navegador, sem serem apagados. Treino não altera recordes.

## Desenvolvimento e validação

- `balance.js`: parâmetros e versão do balanceamento.
- `game.js`: simulação, entrada, desenho e inicialização. As regiões originais foram preservadas porque o checkout não contém os fontes TypeScript/build mencionados nelas. O mesmo núcleo é exportado para Node sem inicializar DOM.
- `index.html`: interface acessível por teclado/toque, HUD e regras.
- `node tests/game.test.js`: testes de regras e reprodução, usando apenas Node 22+.
- `node tests/browser.cjs`: smoke em Chromium desktop/celular/tablet; requer Playwright instalado. `PLAYWRIGHT_MODULE` aceita o caminho de uma instalação existente e `CHROME_BIN` aceita um executável Chromium.

Na tela de derrota, **Baixar diagnóstico** exporta versão, semente, modo, duração, causa, estatísticas e entradas por quadro com índice de passo. Nada é enviado a servidores. O registro é limitado a 60.000 quadros; arquivos truncados são identificados e não permitem replay completo. **Repetir semente** repete a sequência inicial; decisões diferentes ainda produzem partidas diferentes.

Reproduzir um diagnóstico: `node scripts/replay.cjs caminho/do/diagnostico.json`. O script compara pontuação, causa e estatísticas. Fluxos aleatórios de puzzle, inimigos, mira e sabotagem são independentes. Alterações de regras exigem atualizar `balance.version`.

Os testes verificam execução e regras, não diversão. Para calibrar, comparar sessões padrão/avançado com jogadores iniciantes e experientes, teclado e toque. Observar dano por origem, atiradores simultâneos, bloqueios, reparos, ocupação, gemas/s e motivo da derrota. `hits` conta impactos ofensivos em inimigos (uma explosão pode produzir vários), não uma porcentagem de acerto.

Veja [análise original](RELATORIO_ANALISE_GAMEPLAY.md) e [registro de implementação](IMPLEMENTACAO.md).
