# Pixel Pals Platformer

Crie um jogo de plataforma 2D interativo inspirado no clássico Super Mario Bros, com gráficos em estilo retro/pixel art, física de pulo precisa, efeitos sonoros e um sistema de menus completo.

1. TELA INICIAL / MENU PRINCIPAL

Crie um menu inicial estilizado com o título do jogo e dois botões centrais:

- [Singleplayer]

- [Multiplayer]

2. MODO SINGLEPLAYER

Ao clicar em "Singleplayer":

- Inicie a partida imediatamente gerando uma fase com plataformas, blocos destrutíveis, blocos de moedas, inimigos simples que caminham de um lado para o outro e uma bandeira final de conclusão de fase.

- Controles: Teclas A/D ou Setas para mover, Barra de Espaço ou Seta para Cima para pular.

- Adicione um painel superior (HUD) exibindo: Pontuação, Moedas, Vidas restantes e Tempo.

3. MODO MULTIPLAYER (MODAL DE SELEÇÃO)

Ao clicar no botão "Multiplayer", abra uma janela flutuante (modal) com duas opções:

- Botão "Jogar no Teclado": Inicia uma partida cooperativa local na mesma tela, onde o Jogador 1 usa as teclas WASD/Espaço e o Jogador 2 usa as Setas do teclado/Enter.

- Botão "Jogar com Amigos em WiFi": Abre a tela de lobby de rede.

4. SISTEMA REDE/WIFI (1 A 4 JOGADORES VIA LINK)

Ao selecionar "Jogar com Amigos em WiFi":

- Gere automaticamente um ID de sala único e crie um link compartilhável contendo esse código de sala na URL (ex: ?sala=1234).

- Crie uma tela de lobby mostrando os slots dos jogadores conectados em tempo real (de 1 até 4 jogadores).

- Cada jogador conectado deve ter uma cor visual distinta (Ex: Jogador 1 Vermelho, Jogador 2 Verde, Jogador 3 Azul, Jogador 4 Amarelo).

- Utilize a integração nativa com Supabase Realtime (ou WebRTC/PeerJS) para sincronizar continuamente no Canvas a posição (X, Y), estado de pulo e animações dos 4 jogadores na mesma fase.

- Inclua um botão "Copiar Link de Convite" e o botão "Iniciar Jogo" (disponível para o criador da sala).

5. INTERFACE E CONTROLES MÓVEIS

- O visual do jogo e dos menus deve ser responsivo utilizando Tailwind CSS.

- Adicione controles virtuais na tela (D-Pad digital e botão de pulo) se o jogo for aberto em um dispositivo móvel ou tablet.

- Salve o recorde de pontuação do jogador no localStorage do navegador.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://superpixelquest.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b83fa890-7bbd-4a03-867d-86de8bc3687f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
