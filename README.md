# Gerador de Contratos — Digital+ Contabilidade

## Como publicar no Vercel

### 1. Suba para o GitHub
- Crie um repositório no GitHub (pode ser privado)
- Faça upload de todos os arquivos desta pasta:
  - `index.html`
  - `api/claude.js`
  - `vercel.json`

### 2. Conecte no Vercel
- Acesse vercel.com e faça login
- Clique em "Add New Project"
- Importe o repositório do GitHub
- Clique em "Deploy"

### 3. Configure a chave da API (OBRIGATÓRIO)
Após o deploy, vá em:
**Settings → Environment Variables** e adicione:

| Nome | Valor |
|------|-------|
| `ANTHROPIC_API_KEY` | `sk-ant-...` (sua chave da Anthropic) |

Depois clique em **"Redeploy"** para aplicar.

### 4. Pronto!
O sistema estará online e funcionando com IA.

---

## Estrutura dos arquivos

```
/
├── index.html        ← Sistema principal (frontend)
├── api/
│   └── claude.js     ← Proxy seguro para a API da Anthropic
└── vercel.json       ← Configuração do Vercel
```

## Observação de segurança
A chave da API fica **apenas no servidor** (variável de ambiente do Vercel).
Nunca aparece no código frontend visível ao usuário.
