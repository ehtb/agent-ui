# syntax=docker/dockerfile:1.7
#
# The production image: server.mjs serves the built site with Node alone. Build it from this folder with the framework's
# repository root as the named context `agent-ui`:
#
#   docker build --build-context agent-ui=../.. -t agent-ui-production-server .
#   docker run --rm -p 8080:8080 agent-ui-production-server
#
# The example sits two levels below the framework, as it does in the repository, because package.json links the framework
# with "file:../..".
FROM node:24-bookworm-slim AS build
# The layout package.json expects: <framework>/examples/production-server.
COPY --from=agent-ui / /src
WORKDIR /src/examples/production-server
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build
RUN npm prune --omit=dev --no-audit --no-fund


FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
# The server renders pages from the sources next to the build, so the sources ship, not only dist/. Root owns them: the
# process that serves the site cannot change its own code.
COPY --from=build --chown=node:node /src /src
WORKDIR /src/examples/production-server
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
