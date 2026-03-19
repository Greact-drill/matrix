FROM forgejo.ellis.link/continuwuation/continuwuity:latest

# Директория конфигурации внутри образа
# для continuwuity обычно /etc/conduwuit
USER root

RUN mkdir -p /etc/conduwuit

# Копируем наш config.toml в ожидаемое место
COPY config.toml /etc/conduwuit/conduwuit.toml

# Данные будут жить в томе /var/lib/conduwuit
VOLUME ["/var/lib/conduwuit"]

# Ничего не переопределяем: ENTRYPOINT/CMD из базового образа