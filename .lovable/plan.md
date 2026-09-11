# Comando secreto `/amiibo`

## Objetivo
Adicionar ao jogo existente o único recurso novo ainda ausente: personalização da paleta do personagem por uma imagem PNG, exclusiva das partidas WiFi.

## Implementação
- Criar um seletor de arquivo invisível, acionado ao enviar `/amiibo` no chat.
- Aceitar somente PNG e validar o arquivo antes de processá-lo.
- Ler a imagem localmente no navegador, reduzir a amostra e extrair três cores dominantes representativas.
- Aplicar essas cores em tempo real ao personagem local no Canvas.
- Enviar a paleta pela sala para que os outros jogadores vejam a mesma aparência.
- Manter o comando fora do histórico visível e mostrar apenas mensagens de confirmação ou erro ao próprio jogador.
- Atualizar a mensagem de comandos desconhecidos para incluir `/amiibo`.

## Detalhes técnicos
- Estender o estado de rede e a renderização do motor para armazenar uma paleta opcional por jogador.
- Reutilizar o canal de mensagens em tempo real já existente, codificando o comando e suas cores sem alterar o banco de dados.
- Garantir que Singleplayer e cooperativo local continuem sem chat e sem acesso ao comando.

## Validação
- Verificar compilação e erros do jogo.
- Testar no navegador a abertura do seletor, o carregamento de PNG e a mudança visual do personagem.
