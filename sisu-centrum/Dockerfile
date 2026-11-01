FROM node:22-alpine
WORKDIR /app
COPY server.js /app/server.js
COPY public /app/public
RUN mkdir -p /data && chown -R node:node /data /app
USER node
ENV NODE_ENV=production
EXPOSE 8098
CMD ["node", "/app/server.js"]
