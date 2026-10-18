# Quartel do Bento · Convite com confirmação de presença

Página única (HTML) hospedada no GitHub Pages. As respostas caem numa planilha do Google, que pode ser aberta pelo app do Sheets no celular.

```
Convidado (WhatsApp) → github.io (página) → Apps Script → Planilha Google
```

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html` | A página (convite, nome, Sim/Não, contadores, mensagem, agradecimento) |
| `assets/convite.jpg` | Convite exibido no topo |
| `assets/og.jpg` | Imagem de prévia que o WhatsApp mostra ao colar o link |
| `apps-script/Code.gs` | Backend que grava na planilha |

## Configuração (uma vez, ~10 minutos)

### 1. Planilha + Apps Script

1. Crie uma planilha nova em [sheets.new](https://sheets.new) e dê o nome **Quartel do Bento – Confirmações**.
2. Menu **Extensões → Apps Script**.
3. Apague o conteúdo do editor e cole todo o `apps-script/Code.gs`. Salve.
4. No seletor de funções (topo), escolha **`setup`** e clique em **Executar**. Autorize quando o Google pedir (aparece o aviso "app não verificado": *Avançado → Acessar … (não seguro)*; o script é seu). Isso cria as abas **Resumo** e **Respostas**. É seguro rodar de novo: as respostas já recebidas não são apagadas.
5. **Implantar → Nova implantação → Tipo: App da Web**
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
6. Copie a **URL do app da Web** (termina em `/exec`). Abra-a no navegador: deve aparecer `{"ok":true,...}`.

### 2. Ligar a página à planilha

No `index.html`, na seção `CONFIGURAÇÃO`, cole a URL:

```js
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/XXXX/exec';
```

Faça commit e push na branch `main`.

### 3. Publicar no GitHub Pages

No repositório: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save.**
Em ~1 minuto a página estará em:

**https://ldebritto.github.io/quartel-do-bento/**

Esse é o link para enviar no WhatsApp.

### 4. Acompanhar pelo celular

Instale o app **Planilhas Google**, abra a planilha e fixe-a nos favoritos. Compartilhe-a com sua esposa (botão *Compartilhar*). A aba **Resumo** mostra os totais; a aba **Respostas** tem uma linha por pessoa.

## Comportamento

- **Layout**: no celular, uma coluna (convite e, abaixo, o formulário). Em tablet na horizontal e computador (telas a partir de 720 px), duas colunas: convite à esquerda, fixo ao rolar, e formulário à direita.
- **Nome → Sim/Não**: "Sim" abre os três contadores (adultos, crianças de 6 a 12, crianças de 0 a 5); "Não" abre o campo de mensagem.
- **Quem já respondeu** (guardado no aparelho, via `localStorage`, sem cookies) abre o link direto na tela de agradecimento, com resumo, data, endereço, calendário e mapa. Há botões para alterar a resposta ou responder por outra pessoa (celular compartilhado). Em outro aparelho ou navegador, a página volta a mostrar o formulário.
- **Resposta repetida**: quem enviar de novo com o mesmo nome (sem diferenciar maiúsculas e acentos) *atualiza* a linha, sem duplicar.
- **Falha de rede**: se o envio falhar, a pessoa pode tentar de novo sem risco de duplicar.
- **Agradecimento**: mostra o resumo, data, horário e endereço, com botões para o calendário (iPhone/Android), Google Agenda e mapa.

## Se você mudar o `Code.gs`

Depois de editar o script, é preciso **Implantar → Gerenciar implantações → editar (lápis) → Versão: Nova versão → Implantar**. A URL continua a mesma.

## Teste local

Com `APPS_SCRIPT_URL` vazio, a página roda em modo de teste: simula o envio e mostra o payload no console do navegador.

```bash
python3 -m http.server 8000   # e abra http://localhost:8000
```

## Privacidade

O repositório é público (exigência do GitHub Pages gratuito), mas as respostas ficam apenas na planilha, que é privada. A página tem `noindex` para não aparecer em buscadores.

## Fórmulas manuais do Resumo

O `setup` escolhe sozinho entre fórmulas em inglês e em português. Se mesmo assim a aba **Resumo** der erro, digite estas fórmulas nas células B2 a B7 (planilhas em português usam `;` e os nomes em português):

| Célula | Rótulo (coluna A) | Fórmula em português | Fórmula em inglês |
|---|---|---|---|
| B2 | Respostas "Sim" | `=CONT.SE(Respostas!C:C; "Sim")` | `=COUNTIF(Respostas!C:C, "Sim")` |
| B3 | Respostas "Não" | `=CONT.SE(Respostas!C:C; "Não")` | `=COUNTIF(Respostas!C:C, "Não")` |
| B4 | Adultos | `=SOMASE(Respostas!C:C; "Sim"; Respostas!D:D)` | `=SUMIF(Respostas!C:C, "Sim", Respostas!D:D)` |
| B5 | Crianças 6–12 | `=SOMASE(Respostas!C:C; "Sim"; Respostas!E:E)` | `=SUMIF(Respostas!C:C, "Sim", Respostas!E:E)` |
| B6 | Crianças 0–5 | `=SOMASE(Respostas!C:C; "Sim"; Respostas!F:F)` | `=SUMIF(Respostas!C:C, "Sim", Respostas!F:F)` |
| B7 | TOTAL DE PESSOAS | `=SOMA(B4:B6)` | `=SUM(B4:B6)` |
