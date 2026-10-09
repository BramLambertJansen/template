# Lokale en CI-database: officiële Postgres plus pgTAP en pg_prove.
FROM postgres:17.6-bookworm
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl \
 && rm -rf /var/lib/apt/lists/*
