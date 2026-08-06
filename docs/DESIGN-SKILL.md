# Projeto — SKILL genérica, processo e subagentes

> Estado: proposta. Os blocos marcados **verificado** foram conferidos contra o
> código e contra o pacote `eve@0.30.6`. Os marcados **aberto** dependem de
> decisão que não dá para inferir do código.

Ponto de partida: [TRANSITION.csv](./TRANSITION.csv) — 54 arquivos, 6024 linhas
mapeadas, com veredito e risco por linha.

---

## 1. O que o Eve pré-declara num subagente

**Verificado** em `docs/subagents.mdx` do pacote.

Um subagente declarado vive em `agent/subagents/<id>/` e o diretório é a única
coisa que o marca como subagente. `description` é obrigatória — o compilador
recusa sem ela, porque é o que o pai lê para decidir delegar.

```text
agent/subagents/<papel>/
├── agent.ts          # obrigatório: description, model
├── instructions.md   # opcional
├── tools/            # opcional, próprias
├── skills/           # opcional, próprias
├── sandbox/          # opcional, próprio + seed de workspace
└── subagents/        # opcional, aninhados
```

A fronteira de isolamento é total, e isso é o ponto:

| slot | subagente declarado |
|---|---|
| instruções | próprias, ou o padrão do framework |
| tools | próprias |
| skills | próprias |
| sandbox | **próprio**, não herda do pai |
| hooks | próprios |
| estado | novo |
| canais, schedules | **root-only** |

> "A declared subagent inherits nothing from the root's authored slots. An
> absent slot falls back to the framework default, not to the root's version."

Três consequências que decidem o desenho:

**O filho nunca vê o histórico do pai.** Tudo que ele precisa chega pelo
`message`. Isso não é limitação, é exatamente o binário: o mundo do filho é o
briefing mais as ferramentas que a pasta dele declara.

**`defineDynamic` no `agent.ts` do subagente** resolve em `session.started` ou
`turn.started` e devolve `defineAgent(...)` ou nulo. Nulo remove o subagente da
superfície visível. É o mecanismo de "o processo reconhece e muda o que exibe".

**Schedules e canais são root-only.** O Metabolismo como subagente não pode ter
schedule próprio — o que já não é problema, porque a liveness passou a ser o
tick externo.

---

## 2. Onde isso bate com o que existe hoje

**Verificado**: `subagents: 0`. Hoje não há nenhum. Os papéis são lançados como
**sessões root**, por HTTP, com headers `x-institution-role`, e as tools são
resolvidas por papel em `agent/tools/process.ts` via `defineDynamic`.

O que o desenho atual já acerta e deve ser preservado:

- autoridade disjunta é **estrutural**: a sessão do Executor não tem
  `review_process`; não é barrada ao chamar, a ferramenta não existe
- papel vem do auth, não de parâmetro: `appSession()` fixa `role: "translator"`
  para browser e só o `serviceSession()`, atrás do segredo, eleva

O que está errado hoje e o subagente conserta:

- **vazamento**: `get_process_context` devolve `ProcessDetail` inteiro ao
  Executor — `rationale` do Supervisor, `findings` de revisões anteriores,
  submissões de outros responsáveis, pedido bruto
- instruções são as mesmas para todo papel; o específico está espalhado em
  **17 pontos de composição de prompt, em 6 arquivos, em código**

---

## 3. A SKILL genérica

Toda SKILL deriva de um molde. O molde declara **vagas**; a SKILL concreta
declara **como preenche cada vaga**.

### O que toda SKILL tem

| bloco | o que é | quem consome |
|---|---|---|
| `identity` | id, versão, nome; id igual ao nome da pasta | gerador |
| `form` | schema do que quem dá entrada precisa declarar | intake |
| `authority` | quem pode ser dono, quem pode ser responsável | validadores |
| `deadline` | classes permitidas e padrão | `resolveDeadline` |
| `stages[]` | etapas, com responsável, prompt, decisões e **transições** | motor |
| `supply` | requisitos de capacidade e modelos candidatos | roteamento |
| `repetition` | cadência; zero = laço, 24h = recorrência | tick |
| `closure` | o que exige checkpoint aceito | máquina de estados |

O `stages[]` é o coração, e já existe pela metade. Hoje o manifesto declara
`review.allowedDecisions` — falta dizer **para onde cada decisão vai**:

```json
"stages": [{
  "id": "entregar",
  "responsible": "executor",
  "prompt": "...",
  "review": {
    "reviewer": "typeOwner",
    "allowedDecisions": ["accept", "return", "reassign"],
    "on": { "accept": "publicar", "return": "entregar", "reassign": "entregar" }
  }
}]
```

Uma tabela de transição sobre o vocabulário de decisão que **já é imposto**
cobre workflow, laço e execução única. Laço é aresta que volta ao próprio
stage. Execução única é stage sem retorno. Recorrência é aresta a partir do
fechamento.

Nada de linguagem de expressão. Condição fechada sobre decisões enumeradas.
Quando precisar de condição sobre conteúdo, isso é um stage cujo responsável é
código — não sintaxe nova no manifesto.

**Verificado**: `manifest.stages` só aparece em `withStage` e `resolveStage` do
`processes.ts`. **Stages estão declaradas e o motor não avança entre elas.**
Multi-stage nunca existiu. Você preenche um buraco, não substitui mecanismo.

---

## 4. O que uma SKILL gera

Quando um intake vira processo, a SKILL materializa quatro coisas. Nem todas
persistem, e a diferença importa.

| gera | vive | some quando |
|---|---|---|
| **arquivo do processo** | disco, append-only | nunca — é o registro |
| **briefing por papel** | no `message` do subagente | a sessão do papel acaba |
| **superfície de tools** | resolvida por `defineDynamic` | a cada turno |
| **workspace do subagente** | sandbox do subagente | a sessão acaba |

### O arquivo do processo

Um arquivo por processo. Nasce meio preenchido pelo molde e meio em branco pelo
formulário. Cresce só por acréscimo, passando de responsável em responsável até
o eval.

Propriedade que vem de graça: **a unidade de armazenamento é a unidade de
contenção**. Processos diferentes nunca disputam. O único conflito possível é
dois escritores no mesmo processo, e append-only elimina lost update por
construção. O índice único de assignment ativo que existe hoje no SQLite
resolve um problema que esse substrato não tem.

Formato: encadeamento de recibos, com `canonicalJson` (RFC 8785, já no
código, batendo com os nove vectors do conformance) como serialização de hash.
A distinção `tuple_hash` / `content_hash` do `logline.receipt.v0` serve
diretamente: **mesmo ato, interpretações diferentes** é o que uma instituição
que troca de modelo produz.

### O briefing

Não é o arquivo. É uma resposta **composta** para aquele papel naquele estado —
lista de permissão, não lista de negação. Filtrar um objeto grande vaza o que
alguém esquecer de remover, e o esquecimento é silencioso. Compor do zero vaza
só o que foi explicitamente incluído.

Para o Metabolismo, cujo slot real é 2048 tokens, isso não é higiene: é o que
faz caber. Mesma disciplina do digest que já está em `shared/metabolism-digest.ts`.

### O que **não** deve gerar

**SQL temporário e API temporária: não.** Ambos criam uma segunda fonte de
verdade com tempo de vida próprio, e é o erro que este código já cometeu uma
vez — `threads.state` reserializa os eventos do Eve porque não confiou na
durabilidade que já tinha. O arquivo é o registro; o SQLite fica como **índice**
(busca, listagem, prazo), derivado e reconstruível. Se índice e arquivo
discordarem, o arquivo ganha, e o índice se refaz.

---

## 5. O despertar genérico

Todo papel acorda igual. O específico vem do briefing.

> Você está numa instituição. Existe um processo em andamento e você tem
> exatamente um trabalho nele agora. Você não sabe qual — pergunte. Você não
> aprova o próprio trabalho. Quando terminar, submeta.
> Sua única ação inicial é chamar `briefing`.

Dez linhas contra as 79 de `base-instructions.ts` mais o que hoje vai nas
mensagens de lançamento.

**Descobrir não é impedir.** A lista que o briefing devolve é orientação; a
recusa continua sendo a ausência da ferramenta. Os dois concordam porque leem a
mesma fonte, mas são mecanismos independentes:

```
papel  → o teto do possível   (pasta do subagente + defineDynamic)
estado → o que cabe agora     (anunciado pelo briefing)
```

O doc do Eve é explícito: *"Do not rely on subagent delegation by itself as an
approval boundary."*

---

## 6. A questão aberta que decide a forma

**Aberto.** Um subagente é despachado por um **modelo do pai chamando uma
tool**. A instituição quer lançar papéis **do servidor**, deterministicamente,
depois de uma decisão de checkpoint. O servidor não chama tool de subagente —
ele só inicia sessão root.

Três saídas, e nenhuma é obviamente certa:

1. **Root despachante.** O servidor inicia uma sessão root cuja única instrução
   é ler o briefing e delegar ao subagente nomeado. Custa uma chamada de modelo
   por lançamento de papel. Isolamento real.
2. **Manter sessões root por papel** (como hoje), com instruções e tools
   dinâmicas. Sem chamada extra. Isolamento parcial: sandbox e skills
   compartilhados, e o vazamento precisa ser fechado à mão.
3. **`Workflow`**, que o doc cita para orquestrar subagentes programaticamente.
   **Verificado**: hoje está desligado em `agent/tools/Workflow.ts` com
   `disableTool()`. Não investiguei se serve aqui.

A opção 1 é a que realiza o desenho que você descreveu. O custo é uma chamada
de modelo pequena por transição de papel — em hardware local, mensurável, e
exatamente o tipo de coisa que a base de observação deveria medir antes de a
gente decidir por intuição.

---

## 7. Ordem de transição

Cada etapa termina com typecheck, testes e build verdes, e um commit. Se uma
virar sopa, `git revert` de um commit devolve o estado anterior.

| # | etapa | entrega | reversível |
|---|---|---|---|
| 1 | Fechar o vazamento: `get_process_context` composto por papel | binário na prática, sem mudar substrato | sim |
| 2 | Um subagente piloto (Executor) com pasta própria | mede o custo da opção 1 com números | sim |
| 3 | Transições no manifesto + motor de stage | workflow, laço e recorrência de uma vez | sim |
| 4 | Absorver os 17 pontos de prompt no manifesto | mudar processo deixa de exigir deploy | sim |
| 5 | Arquivo do processo como registro; SQLite vira índice | ponto sem volta | **não** |
| 6 | Formulário no intake; Translator só onde há ambiguidade | economiza uma sessão por entrada estruturada | sim |

A etapa 5 é a única sem volta fácil, e é de propósito a última: quando ela
começar, tudo que vem antes já estará provado rodando.

**Antes de qualquer uma delas**, o loop institucional completo precisa rodar
uma vez — intake → tradução → supervisão → checkpoint → claim → execução →
submissão → **reprovação** → correção → aceitação → fechamento → metabolismo sem
órfão. Nunca rodou. É mais barato descobrir quais campos aparecem em cada
passagem de bastão rodando do que decidindo no papel.
