package se.nimloth.openehr.compiler;

import com.nedap.archie.adl14.ADL14Converter;
import com.nedap.archie.adl14.ADL14ConversionConfiguration;
import com.nedap.archie.adl14.ADL14Parser;
import com.nedap.archie.adl14.ADL2ConversionResult;
import com.nedap.archie.adl14.ADL2ConversionResultList;
import com.nedap.archie.aom.Archetype;
import com.nedap.archie.aom.OperationalTemplate;
import com.nedap.archie.flattener.Flattener;
import com.nedap.archie.flattener.FlattenerConfiguration;
import com.nedap.archie.flattener.SimpleArchetypeRepository;
import org.openehr.referencemodels.BuiltinReferenceModels;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * Nimloth Core openEHR Compiler — CLI entrypoint.
 *
 * <h2>P3.0b — riktig ADL/AOM &rarr; OPT 1.4-brygga (2026-09-09/10)</h2>
 *
 * <p>Tidigare (0.1.0-diagnostic) läste denna klass bara ADL-headern med
 * regex och skrev en diagnostisk rapport — ingen riktig OPT producerades.
 * Skälet var dokumenterat i {@code PHASE-3.0-REPORT.md}: ingen färdig bro
 * mellan archies AOM-objekt och EHRbase-accepterad XML-OPT 1.4 fanns.</p>
 *
 * <p>Den bryggan finns nu i {@link OperationalTemplateXmlBuilder} — en
 * <b>generisk</b> (arketyp-oberoende) trädvandrare som använder archies
 * riktiga {@code ADLParser} + {@code Flattener} (inte regex) och
 * serialiserar resultatet till samma OPT-XML-form som redan är
 * EHRbase-verifierad via de handskrivna bridge-builders i
 * {@code services/openehr-composer/src/bridge/}. Skillnaden: en ny arketyp
 * i {@code archetypes/} kräver ingen ny kod här — bara en ny .adl-fil.</p>
 *
 * <p>Kända begränsningar (se {@code P3.0b_Nattresultat}-dokumentationen i
 * nimloth-docs för fullständig status): finkorniga primitiva
 * värdebegränsningar (C_STRING-mönster, enstaka C_INTEGER/C_REAL-intervall
 * utanför DV_QUANTITY) vidgas till obegränsade — se
 * {@link OperationalTemplateXmlBuilder#getWarnings()}. Arketyper med
 * konstruktioner denna första version inte hanterar (t.ex. arketyp-slots,
 * CAttributeTuple) misslyckas med ett tydligt, loggat fel per arketyp —
 * övriga arketyper i samma batch påverkas inte.</p>
 *
 * <h2>Användning</h2>
 * <pre>
 *   java -jar openehr-compiler.jar &lt;archetypes-dir&gt; &lt;output-dir&gt;
 * </pre>
 * CLI-kontraktet är oförändrat sedan 0.1.0-diagnostic (P3.0b-REPORT AC5).
 */
public class CompileMain {
    private static final Logger LOG = LoggerFactory.getLogger(CompileMain.class);
    private static final String VERSION = "0.2.0-p3.0b";

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
            return;
        }

        LOG.info("Nimloth Core openEHR Compiler v{} — ADL/AOM -> OPT 1.4", VERSION);

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
        report.append("# Nimloth Core openEHR Compiler — kompileringsrapport\n\n");
        report.append("Generated: ").append(Instant.now()).append("\n");
        report.append("Compiler version: ").append(VERSION).append("\n");
        report.append("Source dir: ").append(archetypesDir.toAbsolutePath()).append("\n\n");
        report.append("> **Status:** P3.0b — riktig ADL/AOM->OPT-brygga (generisk trädvandring,\n");
        report.append("> se OperationalTemplateXmlBuilder). Ersätter 0.1.0-diagnostic.\n\n");

        int failures = 0;
        int successes = 0;
        for (Path adlFile : adlFiles) {
            String fileName = adlFile.getFileName().toString();
            report.append("## ").append(fileName).append("\n\n");
            try {
                CompileResult result = compileOne(adlFile);
                Path optFile = outputDir.resolve(result.templateId + ".opt");
                Files.writeString(optFile, result.optXml, StandardCharsets.UTF_8);
                successes++;
                LOG.info("Kompilerad: {} -> {} ({} bytes)", fileName, optFile.getFileName(), result.optXml.length());
                report.append("- archetype_id: `").append(result.archetypeId).append("`\n");
                report.append("- template_id: `").append(result.templateId).append("`\n");
                report.append("- output: `").append(optFile.getFileName()).append("`\n");
                report.append("- status: OK\n");
                if (!result.warnings.isEmpty()) {
                    report.append("- warnings (").append(result.warnings.size()).append("):\n");
                    for (String w : result.warnings) {
                        report.append("  - ").append(w).append("\n");
                    }
                }
                report.append("\n");
            } catch (Exception e) {
                failures++;
                LOG.error("Misslyckades kompilera {}: {}", fileName, e.toString());
                report.append("- status: FAILED\n");
                report.append("- error: ").append(e.getClass().getSimpleName()).append(": ").append(e.getMessage()).append("\n\n");
            }
        }

        report.append("## Sammanfattning\n\n");
        report.append("- Totalt: ").append(adlFiles.size()).append("\n");
        report.append("- Lyckades: ").append(successes).append("\n");
        report.append("- Misslyckades: ").append(failures).append("\n");

        Path reportFile = outputDir.resolve("compiler-diagnostic-report.md");
        try {
            Files.writeString(reportFile, report.toString(), StandardCharsets.UTF_8);
            LOG.info("Rapport skriven till: {}", reportFile);
        } catch (IOException e) {
            LOG.error("Kunde inte skriva rapport: {}", reportFile, e);
        }

        LOG.info("Klart. {}/{} arketyper kompilerade till riktig OPT-XML.", successes, adlFiles.size());
        if (successes == 0) {
            System.exit(2);
        }
        // Exit 0 så länge minst en arketyp gav en riktig OPT — delvis
        // täckning är ett känt, dokumenterat läge (se D6/§ i nattrapporten),
        // inte ett CI-rött fel. Antal failures loggas och rapporteras.
    }

    /** Package-private (inte private) så testsviten kan köra samma pipeline som CLI:t utan att duplicera den. */
    static class CompileResult {
        final String archetypeId;
        final String templateId;
        final String optXml;
        final List<String> warnings;

        CompileResult(String archetypeId, String templateId, String optXml, List<String> warnings) {
            this.archetypeId = archetypeId;
            this.templateId = templateId;
            this.optXml = optXml;
            this.warnings = warnings;
        }
    }

    static CompileResult compileOne(Path adlFile) throws Exception {
        // Arketyperna i infra/openehr/archetypes/ är ADL 1.4-källor (header
        // "archetype (adl_version=1.4; ...)"). Archies generella ADLParser
        // talar bara ADL2-grammatiken (kräver fullt semver-id, t.ex. v1.0.0)
        // — därför krävs den dedikerade ADL14Parser+ADL14Converter-vägen
        // (verifierad mot archies egen ADL14ToADL2Test) istället för
        // ADLParser direkt, som gav "expecting ARCHETYPE_HRID" på alla 9
        // arketyper vid första körningen ikväll.
        ADL14ConversionConfiguration conversionConfig = new ADL14ConversionConfiguration();
        Archetype adl14Raw;
        try (InputStream stream = Files.newInputStream(adlFile)) {
            adl14Raw = new ADL14Parser(BuiltinReferenceModels.getMetaModels()).parse(stream, conversionConfig);
        }
        ADL14Converter converter = new ADL14Converter(BuiltinReferenceModels.getMetaModels(), conversionConfig);
        ADL2ConversionResultList conversionResults = converter.convert(Collections.singletonList(adl14Raw));
        ADL2ConversionResult conversionResult = conversionResults.getConversionResults().get(0);
        if (conversionResult.getException() != null) {
            throw conversionResult.getException();
        }
        Archetype archetype = conversionResult.getArchetype();

        String archetypeId = archetype.getArchetypeId() != null
            ? archetype.getArchetypeId().getFullId()
            : adlFile.getFileName().toString().replace(".adl", "");

        FlattenerConfiguration config = FlattenerConfiguration.forOperationalTemplate();
        Flattener flattener = new Flattener(new SimpleArchetypeRepository(), BuiltinReferenceModels.getMetaModels(), config);
        Archetype flattenedArchetype = flattener.flatten(archetype);
        if (!(flattenedArchetype instanceof OperationalTemplate)) {
            throw new IllegalStateException("Flattener returnerade inte en OperationalTemplate för " + archetypeId);
        }
        OperationalTemplate flattened = (OperationalTemplate) flattenedArchetype;

        String concept = archetype.getDefinition() != null && archetype.getDefinition().getMeaning() != null
            ? archetype.getDefinition().getMeaning()
            : archetypeId;

        // template_id: härlett från KÄLLFILENS eget namn (t.ex.
        // "openEHR-EHR-OBSERVATION.body_temperature.v2"), inte från
        // archetype_id efter ADL14->ADL2-konvertering — konverteringen
        // skriver om versionen till fullt semver (t.ex. "v2.1.9"), vilket
        // gjorde ett tidigare försök att derivera template_id från
        // archetype_id oläsbart (blev bara "v2.1.9.p3_0b").
        String sourceFileStem = adlFile.getFileName().toString().replace(".adl", "");
        String conceptSegment = sourceFileStem.contains(".")
            ? sourceFileStem.substring(sourceFileStem.indexOf('.') + 1)
            : archetypeId;
        String templateId = conceptSegment + ".p3_0b";

        OperationalTemplateXmlBuilder builder = new OperationalTemplateXmlBuilder();
        String xml = builder.build(flattened, archetypeId, templateId, concept);
        return new CompileResult(archetypeId, templateId, xml, builder.getWarnings());
    }
}
