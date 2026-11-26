# One image: the Vue client built to static files, served by the Python server
# beside the API — the shape Forma ships in.

# ── client ────────────────────────────────────────────────────────────────────
FROM node:22-bookworm AS client
RUN corepack enable
WORKDIR /client
COPY client/package.json client/pnpm-lock.yaml* client/.npmrc ./
RUN pnpm install --frozen-lockfile
COPY client/ ./
RUN pnpm build

# ── server dependencies ───────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm AS server
WORKDIR /src
ENV PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
COPY server/pyproject.toml ./
COPY server/notes ./notes
RUN pip install --prefix=/install .

# ── runtime ───────────────────────────────────────────────────────────────────
FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    CLIENT_DIR=/app/dist PORT=8080

# The dependencies, without the installed copy of the package itself: the code
# runs from /app/notes, so there is one copy of it and it is the one compiled.
RUN --mount=from=server,source=/install,target=/install \
    cp -a /install/. /usr/local/ \
 && rm -rf /usr/local/lib/python3.12/site-packages/notes \
           /usr/local/lib/python3.12/site-packages/notes-*.dist-info
COPY server/notes ./notes
RUN python -m compileall -q notes
COPY server/migrations ./migrations
# The operator scripts: import_sso_users.py runs once at the cut-over from the SSO.
COPY server/scripts ./scripts
COPY --from=client /client/dist ./dist

RUN useradd --system --uid 1000 notes
USER notes

EXPOSE 8080

# What `docker rollout` waits on before the old container goes; /health answers
# 503 once /tmp/drain exists (the pre-stop hook), so Traefik stops sending to a
# container on its way out.
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=4).status == 200 else 1)"]

CMD ["sh", "-c", "exec uvicorn notes.shared.api.main:create_app --factory --host 0.0.0.0 --port ${PORT} --no-access-log --timeout-graceful-shutdown 20"]
