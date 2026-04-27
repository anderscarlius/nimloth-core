package se.nimloth.openehr.compiler;

import com.nedap.archie.aom.Archetype;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Nimloth Core openEHR Compiler — CLI entrypoint.
 *
 * <h2>Aktuellt läge: Fas 3.0 / pivot (C) — diagnostic mode</h2>
 *
 * <p>Den här compilern är i sitt nuvarande tillstånd <b>en valider-och-rapportera-
 * tool för ADL-källfiler, inte en full ADL→OPT-kompilator</b>. Skälet är
 * dokumenterat i {@code infra/openehr/compiler/PHASE-3.0-REPORT.md}:
 * arkitekturen som krävs för att producera <i>XML-OPT 1.4</i> (formatet som
 * EHRbase 2.x kräver via {@code /definition/template/adl1.4}-endpointen) finns
 * inte tillgänglig out-of-the-box i Archie 3.14.0 eller i EHRbase Open Source
 * SDK. Att skriva en bridge mellan archies AOM-objekt och SDK:ns xmlbeans-
 * genererade opt-1.4-klasser är ett uppföljningsuppdrag (P3.0b).</p>
 *
 * <p>Vad denna compiler levererar i Fas 3.0:</p>
 * <ul>
 *   <li>Strukturerad inläsning av ADL 1.4-filer (BOM-stripping, header-parse)</li>
 *   <li>Diagnostisk rapport om varje arketyp (id, version, filstorlek, header)</li>
 *   <li>Container-pipeline reproducerbar via Docker</li>
 *   <li>Strukturerad output för P3.0b-vidareutveckling</li>
 * </ul>
 *
 * <p>För Sprint 2 (P3.1+) används istället <b>fixtures direkt</b> från
 * {@code infra/openehr/test-fixtures/} via {@code pnpm openehr:load-templates}.
 * Detta tillåter composer/AQL-broker/paritetsdiff att utvecklas parallellt
 * med P3.0b.</p>
 *
 * <h2>Användning</h2>
 * <pre>
 *   java -jar openehr-compiler.jar &lt;archetypes-dir&gt; &lt;output-dir&gt;
 * </pre>
 *
 * <p><b>FUTURE (P3.0b):</b> När AOM→XML-OPT-bridge är på plats kommer
 * {@link #parseAdlHeader} ersättas med full archie ADL14Parser + flatten +
 * SDK opt-1.4-xmlbeans-serialize. CLI-kontraktet bevaras: input archetypes-dir,
 * output: OPT-XML-filer per arketyp.</p>
 *
 * <p><b>FUTURE (P3.5):</b> Den här klassen wrappas i Spring Boot-tjänst.
 * Funktionsuppdelningen i statiska metoder underlättar HTTP-wrappning.</p>
 */
public class CompileMain {
    private static final Logger LOG = LoggerFactory.getLogger(CompileMain.class);
    private static final String VERSION = "0.1.0-diagnostic";

    /** Pattern för ADL-header: archetype (adl_version=1.4; uid=...) följt av archetype_id. */
    private static final Pattern HEADER_PATTERN = Pattern.compile(
        "(?s)archetype\\s*\\(([^)]*)\\)\\s+(openEHR-[A-Z_]+-[A-Z_]+\\.[a-zA-Z0-9_]+\\.v\\d+)"
    );
    private static final Pattern ADL_VERSION_PATTERN = Pattern.compile("adl_version\\s*=\\s*([0-9.]+)");
    private static final Pattern UID_PATTERN = Pattern.compile("uid\\s*=\\s*([0-9a-fA-F-]+)");

    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Användning: java -jar openehr-compiler.jar <archetypes-dir> <output-dir>");
            System.exit(1);
        }

        Path archetypesDir = Paths.get(args[0]);
        Path outputDir = Paths.get(args[1]);

        if (!Files.isDirectory(archetypesDir)) {
            LOG.error("archetypes-dir finns inte eller är inte en mapp: {}", archetypesDir);
            System.exit(1);
        }

        try {
            Files.createDirectories(outputDir);
        } catch (IOException e) {
            LOG.error("Kunde inte skapa output-dir: {}", outputDir, e);
            System.exit(1);
        }

        LOG.info("Nimloth Core openEHR Compiler v{} — diagnostic mode", VERSION);
        LOG.info("Archie {} finns på classpath. Full ADL→OPT-pipeline kommer i P3.0b.",
            classpathHasArchie() ? "(detected)" : "(NOT FOUND)");

        List<Path> adlFiles;
        try (Stream<Path> stream = Files.list(archetypesDir)) {
            adlFiles = stream
                .filter(p -> p.getFileName().toString().endsWith(".adl"))
                .filter(p -> !p.getFileName().toString().startsWith("."))
                .sorted()
                .collect(Collectors.toList());
        } catch (IOException e) {
            LOG.error("Kunde inte läsa archetypes-dir: {}", archetypesDir, e);
            System.exit(1);
            return;
        }

        if (adlFiles.isEmpty()) {
            LOG.warn("Inga .adl-filer hittades i {}", archetypesDir);
            System.exit(0);
        }

        StringBuilder report = new StringBuilder();
        report.append("# Nimloth Core openEHR Compiler — diagnostic report\n\n");
        report.append("Generated: ").append(Instant.now()).append("\n");
        report.append("Compiler version: ").append(VERSION).append("\n");
        report.append("Source dir: ").append(archetypesDir.toAbsolutePath()).append("\n\n");
        report.append("> **Status:** Fas 3.0 pivot (C) — diagnostic mode. Producerar inte\n");
        report.append("> XML-OPT än; den uppgraderingen är planerad till P3.0b. För Sprint 2\n");
        report.append("> används test-fixtures från `infra/openehr/test-fixtures/` direkt.\n\n");

        int parseFailures = 0;
        for (Path adlFile : adlFiles) {
            try {
                AdlInfo info = parseAdlHeader(adlFile);
                LOG.info("Läst: {}  → archetype_id={}, adl_version={}",
                    adlFile.getFileName(), info.archetypeId, info.adlVersion);
                report.append("## ").append(adlFile.getFileName()).append("\n\n");
                report.append("- archetype_id: `").append(info.archetypeId).append("`\n");
                report.append("- adl_version: ").append(info.adlVersion).append("\n");
                report.append("- uid: ").append(info.uid).append("\n");
                report.append("- file_size: ").append(Files.size(adlFile)).append(" bytes\n");
                report.append("- bom_detected: ").append(info.hasBom).append("\n");
                report.append("- read_status: OK\n\n");
            } catch (Exception e) {
                LOG.error("Misslyckades läsa {}: {}", adlFile.getFileName(), e.getMessage());
                parseFailures++;
                report.append("## ").append(adlFile.getFileName()).append("\n\n");
                report.append("- read_status: FAILED\n");
                report.append("- error: ").append(e.getMessage()).append("\n\n");
            }
        }

        Path reportFile = outputDir.resolve("compiler-diagnostic-report.md");
        try {
            Files.writeString(reportFile, report.toString(), StandardCharsets.UTF_8);
            LOG.info("Diagnostisk rapport skriven till: {}", reportFile);
        } catch (IOException e) {
            LOG.error("Kunde inte skriva rapport: {}", reportFile, e);
        }

        if (parseFailures > 0) {
            LOG.error("{} av {} ADL-filer kunde inte läsas.", parseFailures, adlFiles.size());
            System.exit(2);
        }

        LOG.info("Klart. {} ADL-filer lästa utan fel.", adlFiles.size());
    }

    /** Resultat från ADL-header-parsning. */
    public static class AdlInfo {
        public final String archetypeId;
        public final String adlVersion;
        public final String uid;
        public final boolean hasBom;
        AdlInfo(String archetypeId, String adlVersion, String uid, boolean hasBom) {
            this.archetypeId = archetypeId;
            this.adlVersion = adlVersion;
            this.uid = uid;
            this.hasBom = hasBom;
        }
    }

    /**
     * Läs ADL-fil, strippa BOM, extrahera header-information.
     *
     * <p>FUTURE (P3.0b): ersätts med {@code com.nedap.archie.adl14.ADL14Parser}
     * som returnerar full {@link Archetype}-AOM-objekt redo för flatten + serialize.</p>
     */
    public static AdlInfo parseAdlHeader(Path adlFile) throws IOException {
        String content = Files.readString(adlFile, StandardCharsets.UTF_8);
        boolean hasBom = !content.isEmpty() && content.charAt(0) == '﻿';
        if (hasBom) content = content.substring(1);

        // Hämta första ~500 bytes som header-area
        String header = content.length() > 500 ? content.substring(0, 500) : content;

        Matcher m = HEADER_PATTERN.matcher(header);
        if (!m.find()) {
            throw new IOException("ADL-header inte i förväntad form (archetype (...) <id>)");
        }
        String headerArgs = m.group(1);
        String archetypeId = m.group(2);

        Matcher vm = ADL_VERSION_PATTERN.matcher(headerArgs);
        String adlVersion = vm.find() ? vm.group(1) : "(missing)";

        Matcher um = UID_PATTERN.matcher(headerArgs);
        String uid = um.find() ? um.group(1) : "(missing)";

        return new AdlInfo(archetypeId, adlVersion, uid, hasBom);
    }

    /** Verifierar att archie-klasser finns på classpath — diagnostisk. */
    private static boolean classpathHasArchie() {
        try {
            Class.forName("com.nedap.archie.aom.Archetype");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
