FROM alpine:3.20
RUN apk add --no-cache curl grep sed coreutils openssh-client sshpass
COPY run.sh /run.sh
RUN chmod +x /run.sh
ENTRYPOINT ["/bin/sh", "/run.sh"]
