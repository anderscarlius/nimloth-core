package se.nimloth.openehr.compiler;

import org.junit.jupiter.api.Test;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.net.URL;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * P3.0b — testsvit för den riktiga ADL/AOM-&gt;OPT-bryggan.
 *
 * <p>Pekar direkt mot de RIKTIGA, incheckade arketyperna i
 * {@code infra/openehr/archetypes/} (inte kopior/fixtures) — testerna
 * körs från modulens rot ({@code infra/openehr/compiler/}) via Maven,
 * så sökvägen är relativ ({@code ../archetypes/...}). Detta är medvetet:
 * D6-kriteriet är "producerar OPT från checked-in ADL med testassert",
 * inte "producerar OPT från en fixture som råkar se ut som en arketyp".</p>
 */
class CompileMainTest {

    private static final Path ARCHETYPES_DIR = Path.of("..", "archetypes");

    @Test
    void compilesBodyTemperatureToValidOpt() throws Exception {
        Path adl = ARCHETYPES_DIR.resolve("openEHR-EHR-OBSERVATION.body_temperature.v2.adl");
        assertTrue(Files.exists(adl), "Förväntad, incheckad arketyp saknas: " + adl.toAbsolutePath());

        CompileMain.CompileResult result = CompileMain.compileOne(adl);

        assertEquals("body_temperature.v2.p3_0b", result.templateId);
        assertTrue(result.archetypeId.startsWith("openEHR-EHR-OBSERVATION.body_temperature.v2"),
            "archetype_id oväntad: " + result.archetypeId);

        Document doc = parseXml(result.optXml);
        assertEquals("template", doc.getDocumentElement().getLocalName());

        String archetypeIdValue = firstValueOf(doc, "archetype_id");
        assertTrue(archetypeIdValue.startsWith("openEHR-EHR-OBSERVATION.body_temperature.v2"));

        // Konceptet ("Body temperature") ska vara en riktig etikett hämtad
        // ur ADL-källans egen ontologi, inte en gissning.
        assertTrue(result.optXml.contains("Body temperature"),
            "Förväntade den riktiga arketyp-etiketten 'Body temperature' i OPT-utdatan");
    }

    @Test
    void compilesPulseToValidOpt() throws Exception {
        Path adl = ARCHETYPES_DIR.resolve("openEHR-EHR-OBSERVATION.pulse.v2.adl");
        assertTrue(Files.exists(adl), "Förväntad, incheckad arketyp saknas: " + adl.toAbsolutePath());

        CompileMain.CompileResult result = CompileMain.compileOne(adl);

        assertEquals("pulse.v2.p3_0b", result.templateId);
        assertTrue(result.archetypeId.startsWith("openEHR-EHR-OBSERVATION.pulse.v2"));

        Document doc = parseXml(result.optXml);
        assertEquals("template", doc.getDocumentElement().getLocalName());
        assertTrue(result.optXml.contains("Pulse") || result.optXml.contains("pulse"),
            "Förväntade en pulse-relaterad etikett i OPT-utdatan");
    }

    /**
     * Regressionstest för den NPE-bugg som hittades och åtgärdades ikväll
     * mot en riktig EHRbase 2.30.1: varje nod med ett verkligt (icke-null)
     * node_id måste ha en matchande term_definitions-post, annars kraschar
     * EHRbase:s OPTParser vid malluppladdning. Testar strukturellt (utan att
     * kräva en live EHRbase i CI) att invarianten håller för en riktig,
     * incheckad arketyp.
     */
    @Test
    void everyRealNodeIdHasAMatchingTermDefinition() throws Exception {
        Path adl = ARCHETYPES_DIR.resolve("openEHR-EHR-OBSERVATION.body_temperature.v2.adl");
        CompileMain.CompileResult result = CompileMain.compileOne(adl);
        Document doc = parseXml(result.optXml);

        Set<String> nodeIds = new HashSet<>();
        collectNonEmptyTextContent(doc.getElementsByTagNameNS("*", "node_id"), nodeIds);

        Set<String> termCodes = new HashSet<>();
        NodeList termDefs = doc.getElementsByTagNameNS("*", "term_definitions");
        for (int i = 0; i < termDefs.getLength(); i++) {
            Element el = (Element) termDefs.item(i);
            termCodes.add(el.getAttribute("code"));
        }

        Set<String> missing = new HashSet<>(nodeIds);
        missing.removeAll(termCodes);
        assertTrue(missing.isEmpty(), "node_id utan matchande term_definitions (orsakar EHRbase-NPE): " + missing);
    }

    @Test
    void malformedAdlProducesClearErrorInsteadOfSilentGarbage() throws Exception {
        URL resource = getClass().getResource("broken-header.adl");
        assertTrue(resource != null, "Testfixturen broken-header.adl saknas");
        Path brokenAdl = Path.of(resource.toURI());

        Exception thrown = assertThrows(Exception.class, () -> CompileMain.compileOne(brokenAdl));
        assertFalse(thrown.getMessage() == null || thrown.getMessage().isBlank(),
            "Felet ska ha ett begripligt meddelande, inte tyst misslyckas");
    }

    private static void collectNonEmptyTextContent(NodeList nodes, Set<String> out) {
        for (int i = 0; i < nodes.getLength(); i++) {
            String text = nodes.item(i).getTextContent();
            if (text != null && !text.isBlank()) {
                out.add(text.trim());
            }
        }
    }

    private static String firstValueOf(Document doc, String elementLocalName) {
        NodeList nodes = doc.getElementsByTagNameNS("*", elementLocalName);
        assertTrue(nodes.getLength() > 0, "Hittade inget <" + elementLocalName + "> i OPT-utdatan");
        Element el = (Element) nodes.item(0);
        NodeList values = el.getElementsByTagNameNS("*", "value");
        return values.getLength() > 0 ? values.item(0).getTextContent() : el.getTextContent();
    }

    private static Document parseXml(String xml) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        return dbf.newDocumentBuilder().parse(new InputSource(new StringReader(xml)));
    }
}
