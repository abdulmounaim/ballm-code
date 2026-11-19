FROM oryd/kratos:v26.2.0

COPY kratos.yml.template /etc/config/kratos/kratos.yml.template
COPY identity.schema.json /etc/config/kratos/identity.schema.json
COPY entrypoint.sh /usr/local/bin/ballm-kratos-entrypoint
USER root
RUN chmod +x /usr/local/bin/ballm-kratos-entrypoint \
  && chown -R 10000:101 /etc/config/kratos
USER 10000:101

EXPOSE 4433 4434

ENTRYPOINT ["/usr/local/bin/ballm-kratos-entrypoint"]
