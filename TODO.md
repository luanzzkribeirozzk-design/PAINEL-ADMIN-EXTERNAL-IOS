# TODO — Painel Admin

- [ ] **Acesso Admin protegido** — aceitar somente key criada pelo Dono; validar hash com pepper no backend; emitir sessão curta em cookie HttpOnly; vincular ao limite de dispositivos; bloquear acesso pausado/bloqueado; não guardar a key completa.
- [ ] **Dashboard e créditos** — mostrar créditos restantes, status do acesso, dispositivos vinculados e somente as keys criadas pelo próprio Admin, com a mais recente primeiro.
- [ ] **Geração atômica de keys** — permitir 1, 3, 7, 15, 30, 60 ou 120 dias; cobrar respectivamente 1, 2, 4, 6, 8, 10 ou 15 créditos; aceitar 1, 2 ou 3 dispositivos; impedir saldo negativo, duplicação e clique concorrente.
- [ ] **Operações nas próprias keys** — permitir pesquisar, pausar, despausar e excluir somente keys do próprio Admin; exclusão deve remover a key da lista, apagar vínculos e registrar auditoria; não permitir alteração de duração.
- [ ] **Telemetria limitada** — permitir consultar e copiar IP observado e identificador de instalação das próprias keys, com aviso sobre NAT/VPN; não permitir bloqueio de IP ou dispositivo.
- [ ] **Prefixo e aparência** — permitir configurar prefixo padrão KEY somente para novas keys; validar caracteres perigosos/tamanho; preservar temas azul, vermelho, verde, padrão, roxo e rosa; manter PWA responsivo.
- [ ] **Proteções de produção** — Firestore deny-by-default; validação de origem, CSP, headers, rate limit, idempotência, auditoria e credenciais privadas somente na Vercel.
- [ ] **Build e entrega** — validar TypeScript e build Vite; publicar branch main no repositório `PAINEL-ADMIN-EXTERNAL-IOS`; depois configurar variáveis na Vercel sem colocar JSON ou private key no GitHub.
