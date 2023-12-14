FROM oven/bun:1 as base

WORKDIR /app

# Install dependencies into the temp directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Copy dependencies and working files into the final image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Run the app
ENTRYPOINT [ "bun", "src/index.ts" ]