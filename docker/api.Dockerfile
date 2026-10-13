FROM maven:3.9.11-eclipse-temurin-21 AS build

WORKDIR /workspace
COPY backend/pom.xml backend/pom.xml
RUN mvn -B -f backend/pom.xml dependency:go-offline
COPY backend/src backend/src
RUN mvn -B -f backend/pom.xml -DskipTests package

FROM eclipse-temurin:21-jre-jammy

WORKDIR /app
COPY --from=build /workspace/backend/target/kusakari-ec-api-0.1.0.jar /app/kusakari-ec-api.jar

ENV SERVER_ADDRESS=0.0.0.0 \
    KUSAKARI_EC_API_PORT=8086

EXPOSE 8086
ENTRYPOINT ["java", "-jar", "/app/kusakari-ec-api.jar"]
