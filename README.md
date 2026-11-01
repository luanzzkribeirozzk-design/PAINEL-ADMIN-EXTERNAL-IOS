# PAINEL-ADMIN-EXTERNAL-IOS

Painel Administrativo separado da ZAYRON STORE para Admins criarem keys Snapchat usando créditos.

## Desenvolvimento

```bash
npm ci
npm run check
npm run build
npm run dev
```

## Variáveis da Vercel

Cadastre as variáveis de `.env.example` nos ambientes Production, Preview e Development conforme necessário. Nunca publique o JSON da service account, `FIREBASE_PRIVATE_KEY`, `LICENSE_PEPPER` ou `ADMIN_SESSION_SECRET` no GitHub.

O frontend não recebe secrets. A key de Admin é validada somente em `api/admin/login.ts`, por hash com pepper, e o cookie de sessão é HttpOnly.

## Deploy

Conecte a Vercel ao repositório `luanzzkribeirozzk-design/PAINEL-ADMIN-EXTERNAL-IOS`, usando a branch `main`. Depois do primeiro deploy, preencha `ADMIN_ALLOWED_ORIGIN` com o domínio final do painel e faça redeploy.
