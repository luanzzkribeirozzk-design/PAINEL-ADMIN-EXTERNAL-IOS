# Plano — PAINEL ADMIN EXTERNAL IOS

## Objetivo

Construir um site separado do Painel Dono para o administrador operar somente suas próprias keys Snapchat usando créditos, mantendo todas as autorizações no backend server-side da Vercel e o Firestore com acesso direto negado.

## Funções do Admin

- Entrar com a key de Admin criada pelo Dono.
- Vincular o acesso ao limite de dispositivos definido pelo Dono.
- Ver saldo, status e lista persistente das próprias keys, com a mais recente primeiro.
- Gerar keys Snapchat com durações de 1, 3, 7, 15, 30, 60 ou 120 dias, custo em créditos de 1, 2, 4, 6, 8, 10 ou 15 e limite de 1, 2 ou 3 dispositivos.
- Debitar créditos e criar a key em uma transação Firestore atômica, com idempotência para impedir duplicação por duplo clique.
- Pausar, despausar e excluir somente keys criadas pelo próprio Admin.
- Consultar e copiar IP observado e identificador de instalação associados às suas keys.
- Alterar somente o prefixo das próximas keys, com padrão KEY e validação de caracteres/tamanho.
- Escolher temas azul, vermelho, verde, padrão, roxo e rosa.

## Segurança

- A key completa não é persistida: somente hash com pepper server-side e preview mascarado.
- Sessão em cookie HttpOnly, Secure em Vercel, SameSite=None para o Preview incorporado e expiração curta.
- Todas as rotas revalidam status, propriedade e escopo no Firestore.
- Vínculo de dispositivo, rate limit, origem, headers, CSP, idempotência, validação de payload e auditoria append-only.
- O Admin não terá rotas para criar Admin, alterar créditos, bloquear IP/dispositivo, ver dados de outros Admins ou modificar duração de keys antigas.
- As Firestore Rules ficam deny-by-default; somente o Firebase Admin SDK do backend escreve.

## Estrutura

- `src/App.tsx`, `src/api.ts`, `src/types.ts`: interface e contratos seguros.
- `api/_lib/adminSecurity.ts`: hash, sessão, cookies, origem, rate limit e serialização.
- `api/admin/login.ts`, `logout.ts`, `dashboard.ts`, `action.ts`: autenticação e operações server-side.
- `public/manifest.webmanifest`, `public/manus-routes.json`: PWA e rotas declaradas.
- `vercel.json`: headers de segurança e cache sem dados privados.
- `firestore.rules`: deny-by-default.

## Fluxo de build

Instalar com `npm ci`, executar `npm run check`, executar `npm run build`, verificar `public/manus-routes.json`, enviar o commit para a branch `main` do GitHub e conectar o repositório à Vercel. As variáveis privadas serão cadastradas somente na Vercel.
