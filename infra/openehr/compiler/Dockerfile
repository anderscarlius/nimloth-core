# syntax=docker/dockerfile:1.6
#
# Bygger Nimloth Core openEHR Compiler — en self-contained shaded JAR.
# Multi-stage: build på temurin-jdk + maven, runtime på temurin-jre.
#
# SHA-pinning: base images ska pinnnas till specifika SHAs för reproducerbarhet.
# Verifiera senaste SHA-värden via:
#   docker pull eclipse-temurin:21-jdk-alpine && docker inspect --format='{{index .RepoDigests 0}}' eclipse-temurin:21-jdk-alpine
# Pasta resultatet i FROM-raderna nedan. Om du tar bort SHA: `--no-cache` blir
# alltjämt reproducerbar inom samma tag, men Docker Hub kan rotera underliggande
# images utan att tag:en ändras.

# ─── Build stage ──────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jdk-alpine AS build

# Maven-version pinnad. SHA512 från dlcdn.apache.org/maven/maven-3/3.9.15/.../tar.gz.sha512
# Apache rotates downloads — uppdatera vid behov via:
#   curl -s "https://dlcdn.apache.org/maven/maven-3/" | grep -oE 'href="3\.[0-9]+\.[0-9]+/"'
ARG MAVEN_VERSION=3.9.16
ARG MAVEN_SHA512=831a8591fe20c8243b1dbe7d71e3244f31d1665b0804b2e825e38cbbe5ce0cafb8338851f90780735568773e0a6cd07bbec107cda0b896b008b861075358b6f6

RUN apk add --no-cache curl bash && \
    curl -fsSL "https://dlcdn.apache.org/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz" -o /tmp/maven.tar.gz && \
    echo "${MAVEN_SHA512}  /tmp/maven.tar.gz" | sha512sum -c - && \
    tar -xzf /tmp/maven.tar.gz -C /opt && \
    ln -s /opt/apache-maven-${MAVEN_VERSION}/bin/mvn /usr/local/bin/mvn && \
    rm /tmp/maven.tar.gz

WORKDIR /build

# Cache dependencies separat för snabbare omkompilering
COPY pom.xml ./
RUN mvn dependency:go-offline -B -q || true

COPY src ./src
RUN mvn package -B -DskipTests -q

# ─── Runtime stage ─────────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre-alpine

LABEL org.opencontainers.image.title="Nimloth Core openEHR Compiler"
LABEL org.opencontainers.image.description="ADL 1.4 → OPT 1.4 batch compiler (P3.0, Nivå 1)"
LABEL org.opencontainers.image.source="https://github.com/anderscarlius/nimloth-core"

WORKDIR /app
COPY --from=build /build/target/openehr-compiler.jar ./openehr-compiler.jar

# Default-volymer för in/output. Mountas vid `docker run`.
VOLUME ["/archetypes", "/templates"]

ENTRYPOINT ["java", "-jar", "/app/openehr-compiler.jar"]
CMD ["/archetypes", "/templates"]
