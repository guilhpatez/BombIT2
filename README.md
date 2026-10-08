# BombIT

Jogo multiplayer de vocabulário técnico em inglês para uso em sala de aula. É um site estático: não usa Node.js, instalação, imagens externas nem etapa de build.

## Como o jogo funciona

- Nos turnos normais, a bomba mostra um fragmento de 2 letras (ex.: `AT`) e o jogador digita uma **palavra comum do inglês** que contenha o fragmento (~35 mil palavras aceitas, em `js/words.js`).
- De vez em quando (a cada 4 a 9 acertos) acontece um **⚡ evento especial**: a bomba fica roxa, aparece a dica em português e a palavra mascarada (ex.: `U _ _`). O jogador digita a palavra especial em inglês. **Errar ou estourar o tempo no evento não tira vida**, só perde o bônus.
- Os eventos não se repetem até todos terem aparecido uma vez.

| Palavra | Evento | Prêmio |
| --- | --- | --- |
| USB | 🔌 Recarga USB | +1 vida (máx. 3) |
| Integer | 🛡️ Escudo Inteiro | bloqueia a próxima vida perdida |
| Tab | 🔀 Aba Reversa | inverte o sentido dos turnos |
| Ink | 🖋️ Respingo de Tinta | próximo jogador perde 4 s |
| Hide Edges | 🌑 Bordas Ocultas | fragmento do próximo jogador fica escondido por 4 s |
| Screen | 🖥️ Tela Limpa | o tempo das bombas volta a 15 s |

Para ajustar a frequência ou os valores, edite as constantes `EVENT_*`, `INK_PENALTY` e `DARK_MS` no topo de `js/game.js`. Para criar um novo evento, adicione um bloco em `SPECIAL_WORDS` (`js/words.js`).

## Páginas do projeto

| Página | Uso |
| --- | --- |
| `index.html` | Entrada dos alunos. Escolhem nome/avatar e seguem para a sala de espera. |
| `sala.html` | Sala de espera, jogo e pódio para os alunos. Não contém controles administrativos. |
| `admin.html` | Painel do admin: iniciar, pular, encerrar e reiniciar partidas. |

Todas as páginas aceitam `?sala=NOME-DA-SALA`. Exemplo:

```text
https://SEU-USUARIO.github.io/bombit/?sala=ingles-3a
```

Use o mesmo parâmetro na página do admin:

```text
https://SEU-USUARIO.github.io/bombit/admin.html?sala=ingles-3a
```

## Uso no dia da aula

1. Abra `admin.html` antes de compartilhar o link com a turma.
2. Entre com o usuário `guilh.patez` e a senha `12345678`.
3. Compartilhe apenas a página principal (`index.html`, ou a raiz do site) com os alunos.
4. Alunos entram, escolhem avatar e aguardam em `sala.html`.
5. Quando houver pelo menos dois alunos conectados, o painel do admin libera **Iniciar partida**. Não é necessário esperar 40 participantes.
6. Durante a rodada, o painel permite pular uma vez travada ou encerrar a partida. Ao fim, **Nova partida** limpa a sala.

> O login do admin está armazenado em `js/admin-auth.js`, como solicitado para esta apresentação única. Por ser um site estático publicado no GitHub Pages, isto é uma barreira de interface, não segurança real: alguém que tenha conhecimentos técnicos pode ler o JavaScript. Não reutilize essa senha em nenhum outro lugar.

## Configurar o Firebase

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com/).
2. Em **Build → Realtime Database**, crie o banco de dados.
3. Em **Build → Authentication → Sign-in method**, ative **Anônimo**.
4. Em **Configurações do projeto → Geral → Seus apps**, registre um app Web e copie o objeto `firebaseConfig`.
5. Cole os valores em `js/firebase-config.js`.
6. Em **Realtime Database → Regras**, publique:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

## Publicar no GitHub Pages

1. Envie todos os arquivos para um repositório GitHub, mantendo `index.html` na raiz.
2. Em **Settings → Pages**, selecione **Deploy from a branch**.
3. Selecione a branch `main` e a pasta `/(root)`.
4. Salve e aguarde a URL do site.

## Arquivos principais

```text
index.html              entrada dos alunos
sala.html               sala de espera e jogo
admin.html              login e painel do admin
css/style.css           aparência responsiva
js/firebase-config.js   configuração do seu projeto Firebase
js/admin-auth.js        credenciais locais da apresentação
js/player.js            entrada dos alunos
js/room.js              sala de espera, jogo e pódio
js/admin.js             painel do admin
js/game.js              regras, turnos, presença e Firebase
js/words.js             palavras especiais (eventos) + dicionário de palavras comuns
```
