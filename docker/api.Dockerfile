FROM maven:3.9.11-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -f backend/pom.xml dependency:go-offline
COPY backend/src backend/src
RUN mvn -B -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre-jammy

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --uid 10001 --no-create-home --shell /usr/sbin/nologin kusakari
WORKDIR /app
COPY docker/import-rds-certificates.sh /tmp/import-rds-certificates.sh
RUN sh /tmp/import-rds-certificates.sh && rm /tmp/import-rds-certificates.sh
COPY --from=build /workspace/backend/target/kusakari-ec-api-0.1.0.jar /app/kusakari-ec-api.jar
RUN chown 10001:10001 /tmp && chmod 0700 /tmp
VOLUME ["/tmp"]

ENV SERVER_ADDRESS=0.0.0.0 \
    KUSAKARI_EC_API_PORT=8086

EXPOSE 8086
USER 10001:10001
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8086/api/health/ready || exit 1
ENTRYPOINT ["java", "-jar", "/app/kusakari-ec-api.jar"]
