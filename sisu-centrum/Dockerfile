FROM node:22-alpine
RUN apk add --no-cache su-exec
WORKDIR /app
COPY server.js /app/server.js
COPY tv_registry.js /app/tv_registry.js
COPY tv_comfort.js /app/tv_comfort.js
COPY tv_content.js /app/tv_content.js
COPY hall_announcements.js /app/hall_announcements.js
COPY public /app/public
COPY default-media /app/default-media
RUN mkdir -p /data && chown -R node:node /data /app
ENV NODE_ENV=production
EXPOSE 8098
CMD ["sh", "-c", "chown node:node /data && exec su-exec node node /app/server.js"]