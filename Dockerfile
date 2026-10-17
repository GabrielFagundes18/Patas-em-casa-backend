# ============================================================================
# ARQUIVO: Dockerfile
# ============================================================================
#
# PARA QUE SERVE:
#   Receita para construir a IMAGEM DOCKER da API (um "pacote" com o Node, as
#   dependências e o código, que roda igual em qualquer servidor). Usa um
#   "multi-stage build" (construção em etapas):
#     1. etapa "deps": instala só as dependências de produção;
#     2. etapa final: copia as dependências prontas e o código, e roda com um
#        usuário sem privilégios de administrador.
#
# PRINCIPAIS INSTRUÇÕES:
#   FROM (imagem base), WORKDIR (pasta de trabalho), COPY (copiar arquivos),
#   RUN (executar comando na construção), ENV (variável de ambiente), VOLUME,
#   USER, EXPOSE, HEALTHCHECK e CMD (comando que inicia o contêiner).
#
# CONEXÕES COM OUTROS ARQUIVOS:
#   - package.json / package-lock.json (dependências), server.js, src/, scripts/.
#   - .dockerignore (o que NÃO entra na imagem).
#   - Construído no CI (.github/workflows/backend-ci.yml, etapa "Imagem Docker").
# ============================================================================

# Imagem de produção da API: dependências sem as de desenvolvimento e usuário sem privilégio.
# --- Etapa 1 ("deps"): instala as dependências ---
# Node 24 em Alpine Linux (imagem pequena). "AS deps" dá um nome à etapa.
FROM node:24-alpine AS deps
# Pasta de trabalho dentro da imagem.
WORKDIR /app
# Copia só os arquivos de dependências primeiro (o Docker reaproveita esta etapa em cache
# enquanto eles não mudarem, o que acelera as próximas construções).
COPY package.json package-lock.json ./
# npm ci: instalação exata pelo package-lock; --omit=dev pula as dependências de desenvolvimento.
RUN npm ci --omit=dev

# --- Etapa 2 (final): só o necessário para rodar ---
FROM node:24-alpine
# Modo produção (cookies Secure, validações de produção em src/config/env.js).
ENV NODE_ENV=production
WORKDIR /app
# Traz as dependências já instaladas da etapa "deps".
COPY --from=deps /app/node_modules ./node_modules
# Código da aplicação.
COPY package.json server.js ./
COPY src ./src
COPY scripts ./scripts
# Fotos enviadas pelo painel (UPLOAD_DIR). Monte um volume aqui para não perdê-las a cada deploy.
# Cria a pasta e a entrega ao usuário "node" (que existe na imagem oficial).
RUN mkdir -p /app/uploads && chown node:node /app/uploads
# VOLUME: indica que esta pasta guarda dados que devem sobreviver ao contêiner.
VOLUME ["/app/uploads"]
# Roda como o usuário "node", sem privilégios de root (mais seguro).
USER node
# Porta em que a API escuta (documentação; quem publica a porta é quem roda o contêiner).
EXPOSE 4000
# Verificação de saúde a cada 30 s: chama /health; se falhar 3 vezes, o contêiner fica "unhealthy".
# (A linha de baixo continua a de cima por causa do "\" no fim.)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
# node direto (sem npm) para o SIGTERM chegar ao processo e o encerramento ser ordenado.
# Formato "exec" (lista JSON): o Node vira o processo principal e recebe os sinais (veja server.js).
CMD ["node", "server.js"]

# ============================================================================
# RESUMO DO ARQUIVO
# ============================================================================
#
# COMO O FLUXO FUNCIONA:
#   docker build → etapa deps instala as dependências de produção → etapa final
#   copia dependências e código, prepara a pasta de fotos, troca para o usuário
#   "node" e define a verificação de saúde → docker run executa "node server.js".
#
# CONCEITOS IMPORTANTES PARA ESTUDAR:
#   - Docker: imagem x contêiner, camadas e cache de construção.
#   - Multi-stage build (imagens menores e sem ferramentas desnecessárias).
#   - Rodar sem root, volumes para dados persistentes e HEALTHCHECK.
#   - CMD em formato exec e repasse de sinais (SIGTERM) ao processo.
# ============================================================================
