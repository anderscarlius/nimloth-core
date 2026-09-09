package se.nimloth.openehr.compiler;

import com.nedap.archie.aom.ArchetypeSlot;
import com.nedap.archie.aom.CAttribute;
import com.nedap.archie.aom.CAttributeTuple;
import com.nedap.archie.aom.CComplexObject;
import com.nedap.archie.aom.CObject;
import com.nedap.archie.aom.CPrimitiveTuple;
import com.nedap.archie.aom.OperationalTemplate;
import com.nedap.archie.aom.primitives.CReal;
import com.nedap.archie.aom.primitives.CString;
import com.nedap.archie.aom.primitives.CTerminologyCode;
import com.nedap.archie.base.Cardinality;
import com.nedap.archie.base.Interval;
import com.nedap.archie.base.MultiplicityInterval;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;

import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import javax.xml.transform.OutputKeys;
import javax.xml.transform.Transformer;
import javax.xml.transform.TransformerException;
import javax.xml.transform.TransformerFactory;
import javax.xml.transform.dom.DOMSource;
import javax.xml.transform.stream.StreamResult;
import java.io.StringWriter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.UUID;

/**
 * P3.0b — genererisk ADL/AOM &rarr; OPT 1.4 XML-serialiserare.
 *
 * <h2>Vad detta löser</h2>
 *
 * <p>Fram till denna klass fanns ingen kod som producerade riktig OPT-XML
 * från en godtycklig arketyp — bara handskrivna, arketyp-specifika
 * xmlbuilder2-byggare i {@code services/openehr-composer/src/bridge/*.ts}
 * (dokumenterat brutet blocklöfte, se {@code Spec_B4_...md} rad 167 i
 * nimloth-docs: "en region kan inte lägga till en ny arketypbaserad modell
 * själv via den vägen"). Den här klassen vandrar istället archies riktiga,
 * flattenade AOM-träd (samma träd oavsett vilken arketyp som matas in) och
 * producerar OPT-XML generiskt — en ny arketyp i {@code archetypes/} kräver
 * ingen ny Java/TypeScript-kod.</p>
 *
 * <h2>XML-formen är empiriskt verifierad, inte gissad</h2>
 *
 * <p>Elementstrukturen (attributnamn, xsi:type-värden, ordning på
 * lower_included/upper_included/lower_unbounded/upper_unbounded/lower/upper
 * m.m.) är hämtad från {@code services/openehr-composer/src/bridge/opt-
 * primitives.ts} och {@code adverse-reaction-risk-opt.ts} — kod som redan
 * bevisat fungerar mot en riktig EHRbase 2.30.1 (HTTP 201, se
 * {@code P3.0b-REPORT.md}). Denna klass återanvänder samma bevisade form,
 * men producerar den genom att vandra ett riktigt AOM-träd istället för att
 * skriva ett facit för hand per arketyp.</p>
 *
 * <h2>ACTION/ism_transition — löst (P3.0c, 2026-09-10)</h2>
 *
 * <p>ACTION-arketyper (t.ex. {@code openEHR-EHR-ACTION.procedure.v1}) har ett
 * {@code ism_transition}-attribut (RM-klass ISM_TRANSITION, med
 * {@code current_state}/{@code careflow_step}, vardera bundna till lokala
 * eller externa terminologikoder via en {@code CTerminologyCode}-constraint).
 * P3.0b:s första version kraschade EHRbase:s {@code OPTParser} vid
 * malluppladdning ({@code IndexOutOfBoundsException} i
 * {@code parseComplexObjectSingle}, {@code .getInputs().get(0).getList()
 * .get(0)}). Rotorsaken (verifierad genom att läsa web-template-sdk:ns
 * källkod, 2.31.0, inte gissad): EHRbase slår upp etiketten för varje
 * KOD-VÄRDE i en {@code code_list} (t.ex. "at9000") via en
 * term-definitions-karta keyad på KOD-STRÄNGEN — inte via nodens egen
 * node_id. {@link #collectTerm(String, CObject)} registrerade bara
 * struktur-noders egna etiketter; {@link #collectTermForCode(String)}
 * lades till för att ÄVEN registrera en etikett per faktiskt kod-värde
 * (uppslagen via arketypens egen {@code ArchetypeTerminology.
 * getTermDefinition}). Fixen är generisk — gäller alla
 * {@code CTerminologyCode}-fält, inte bara ism_transition. 9/9 arketyper i
 * infra/openehr/archetypes/ laddar nu rent mot en riktig EHRbase (verifierat
 * lokalt), inklusive procedure.v1 med fullt fungerande, riktiga
 * careflow-etiketter i WebTemplate-utdatan.</p>
 *
 * <h2>Känd begränsning (dokumenterad, inte gömd)</h2>
 *
 * <p>Finkorniga värdebegränsningar på primitiva löv (C_STRING-mönster,
 * C_INTEGER/C_REAL-intervall utanför DV_QUANTITY-specialfallet nedan) vidgas
 * till obegränsade motsvarigheter — strukturen (träd, kardinalitet,
 * node_id, ontologitermer) är fullt trogen originalet, men exakta
 * värdeintervall/mönster på enskilda primitiver är ett P3.0c-uppföljning.
 * Se {@link #getWarnings()} för en lista över var detta skedde.</p>
 */
public class OperationalTemplateXmlBuilder {

    private static final String OE_NS = "http://schemas.openehr.org/v1";
    private static final String XSI_NS = "http://www.w3.org/2001/XMLSchema-instance";
    private static final String XMLNS_NS = "http://www.w3.org/2000/xmlns/";

    /** Generisk, arketyp-oberoende wrapper-arketyp (samma mönster som P3.0b/c/d-bridge-buildarna). */
    private static final String MINIMAL_COMPOSITION_ARCHETYPE_ID = "openEHR-EHR-COMPOSITION.minimal.v1";

    private final Document doc;
    private final List<String> warnings = new ArrayList<>();
    private final LinkedHashMap<String, String[]> termDefinitions = new LinkedHashMap<>();
    /** Satt i {@link #build}. Behövs för att slå upp etiketter för KOD-VÄRDEN
     * (t.ex. "at9000"), inte bara för nod-identiteter — se {@link #collectTermForCode}. */
    private OperationalTemplate sourceArchetype;

    public OperationalTemplateXmlBuilder() throws ParserConfigurationException {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        this.doc = dbf.newDocumentBuilder().newDocument();
    }

    /** Diagnostiska meddelanden om constraints som vidgades till obegränsade — inte fel, men värt att logga. */
    public List<String> getWarnings() {
        return warnings;
    }

    /**
     * Bygg en fullständig OPT 1.4 XML-sträng.
     *
     * @param flattened      resultatet av {@code Flattener.flatten(archetype)} — den
     *                       flattenade arketypen som ska bli innehållet i den
     *                       syntetiska COMPOSITION-mallen.
     * @param sourceArchetypeId  full arketyp-id (t.ex. "openEHR-EHR-OBSERVATION.body_temperature.v2")
     * @param templateId     mallens egna id (t.ex. "body_temperature.v2.nimloth")
     * @param concept        mänskligt läsbar titel
     */
    public String build(OperationalTemplate flattened, String sourceArchetypeId, String templateId, String concept) {
        termDefinitions.clear();
        warnings.clear();
        this.sourceArchetype = flattened;

        Element template = el("template");
        doc.appendChild(template);
        template.setAttributeNS(XMLNS_NS, "xmlns:xsi", XSI_NS);

        template.appendChild(buildLanguage());
        template.appendChild(buildDescription(concept));
        template.appendChild(valueWrap("uid", UUID.randomUUID().toString()));
        template.appendChild(valueWrap("template_id", templateId));
        template.appendChild(simple("concept", concept));
        template.appendChild(buildDefinition(flattened.getDefinition(), sourceArchetypeId, templateId));

        return serialize();
    }

    // --- Boilerplate (identisk form, oavsett arketyp) ---------------------

    private Element buildLanguage() {
        Element language = el("language");
        Element terminologyId = el("terminology_id");
        terminologyId.appendChild(simple("value", "ISO_639-1"));
        language.appendChild(terminologyId);
        language.appendChild(simple("code_string", "en"));
        return language;
    }

    private Element buildDescription(String concept) {
        Element description = el("description");
        Element originalAuthor = simple("original_author", "Nimloth P3.0b compiler");
        originalAuthor.setAttribute("id", "Original Author");
        description.appendChild(originalAuthor);
        description.appendChild(simple("lifecycle_state", "Initial"));
        String[] otherDetailKeys = {
            "MetaDataSet:Sample Set ", "Acknowledgements", "Business Process Level",
            "Care setting", "Client group", "Clinical Record Element", "Copyright",
            "Issues", "Owner", "Sign off", "Speciality", "User roles",
        };
        for (String key : otherDetailKeys) {
            Element od = simple("other_details", "");
            od.setAttribute("id", key);
            description.appendChild(od);
        }
        Element details = el("details");
        details.appendChild(buildLanguage());
        details.appendChild(simple("purpose", "Genererad av Nimloth P3.0b ADL/AOM->OPT-brygga (generisk, ej arketyp-specifik kod). Concept: " + concept));
        description.appendChild(details);
        return description;
    }

    /**
     * `<definition>` — motsvarar C_ARCHETYPE_ROOT, men INGET xsi:type sätts här:
     * schemat (Template.xsd) deklarerar redan `definition` som typ C_ARCHETYPE_ROOT,
     * så disambiguering behövs bara längre ner i trädet (se {@link #buildChild}).
     * Se opt-primitives.ts / adverse-reaction-risk-opt.ts buildDefinition() för
     * det redan EHRbase-verifierade facit denna metod följer.
     */
    private Element buildDefinition(CComplexObject flattenedRoot, String sourceArchetypeId, String templateId) {
        Element definition = el("definition");
        definition.appendChild(simple("rm_type_name", "COMPOSITION"));
        definition.appendChild(intervalElement("occurrences", boundedOne()));
        definition.appendChild(nodeIdElement("at0000"));
        definition.appendChild(buildCategoryConstraint());
        definition.appendChild(buildContentConstraint(flattenedRoot, sourceArchetypeId));
        Element archetypeIdEl = el("archetype_id");
        archetypeIdEl.appendChild(simple("value", MINIMAL_COMPOSITION_ARCHETYPE_ID));
        definition.appendChild(archetypeIdEl);
        definition.appendChild(valueWrap("template_id", templateId));
        definition.appendChild(termDefinitionElement("at0000", "Minimal", "unknown"));
        return definition;
    }

    private Element buildCategoryConstraint() {
        // "433" = openEHR-terminologins "event"-kod. EHRbase löser openehr::-
        // terminologikoder via sin egen inbyggda TerminologyProvider (behöver
        // inte vår term_definitions-karta) — men vi registrerar en post ändå
        // så invarianten "varje code_list-värde har en term_definitions-post"
        // gäller universellt, utan specialfall för just denna hårdkodade kod.
        termDefinitions.putIfAbsent("433", new String[]{"event", "Event category"});
        Element attributes = el("attributes");
        setXsiType(attributes, "C_SINGLE_ATTRIBUTE");
        attributes.appendChild(simple("rm_attribute_name", "category"));
        attributes.appendChild(intervalElement("existence", boundedOne()));

        Element codedText = el("children");
        setXsiType(codedText, "C_COMPLEX_OBJECT");
        codedText.appendChild(simple("rm_type_name", "DV_CODED_TEXT"));
        codedText.appendChild(intervalElement("occurrences", boundedOne()));
        codedText.appendChild(nodeIdElement(null));
        Element definingCodeAttr = el("attributes");
        setXsiType(definingCodeAttr, "C_SINGLE_ATTRIBUTE");
        definingCodeAttr.appendChild(simple("rm_attribute_name", "defining_code"));
        definingCodeAttr.appendChild(intervalElement("existence", boundedOne()));
        definingCodeAttr.appendChild(buildCodePhrase("openehr", List.of("433")));
        codedText.appendChild(definingCodeAttr);

        attributes.appendChild(codedText);
        return attributes;
    }

    private Element buildContentConstraint(CComplexObject flattenedRoot, String sourceArchetypeId) {
        Element attributes = el("attributes");
        setXsiType(attributes, "C_MULTIPLE_ATTRIBUTE");
        attributes.appendChild(simple("rm_attribute_name", "content"));
        attributes.appendChild(intervalElement("existence", zeroToOne()));
        attributes.appendChild(buildArchetypeRootWrapper(flattenedRoot, sourceArchetypeId));
        attributes.appendChild(cardinalityElement(true, false, zeroToUnbounded()));
        return attributes;
    }

    /**
     * `<children xsi:type="C_ARCHETYPE_ROOT">` — den faktiska målarketypens
     * rot, inklistrad i den syntetiska COMPOSITION-mallen. Detta är den enda
     * platsen i dokumentet som är specifik för VILKEN arketyp som kompileras,
     * och även den drivs av data (archetype-id, flattenad definition), inte
     * av handskriven kod per arketyp.
     */
    private Element buildArchetypeRootWrapper(CComplexObject flattenedRoot, String sourceArchetypeId) {
        Element root = el("children");
        setXsiType(root, "C_ARCHETYPE_ROOT");
        root.appendChild(simple("rm_type_name", flattenedRoot.getRmTypeName()));
        root.appendChild(intervalElement("occurrences", zeroToUnboundedInterval()));
        String rootNodeId = flattenedRoot.getNodeId() != null ? flattenedRoot.getNodeId() : "at0000";
        root.appendChild(nodeIdElement(rootNodeId));

        collectTerm(rootNodeId, flattenedRoot);
        for (CAttribute attribute : flattenedRoot.getAttributes()) {
            appendIfPresent(root, buildAttribute(attribute));
        }

        Element archetypeIdEl = el("archetype_id");
        archetypeIdEl.appendChild(simple("value", sourceArchetypeId));
        root.appendChild(archetypeIdEl);

        for (var entryEl : buildTermDefinitionElements()) {
            root.appendChild(entryEl);
        }
        return root;
    }

    // --- Generisk trädvandring (samma kod oavsett arketyp) -----------------

    /**
     * @return null om attributet inte ska serialiseras alls (se nedan).
     */
    private Element buildAttribute(CAttribute attribute) {
        if (attribute.getChildren().isEmpty()) {
            // EHRbase:s OPTParser (parseComplexObjectSingle) förutsätter minst
            // ett <children>-element under en C_SINGLE_ATTRIBUTE — en tom
            // attributs-nod (existence satt men inga barn) kraschar mall-
            // laddningen med IndexOutOfBoundsException (empiriskt verifierat
            // ikväll: openEHR-EHR-ACTION.procedure.v1 innehöll ett sådant
            // fall). Att hoppa över tomma attribut tappar ingen strukturell
            // information — ett attribut utan barn ger ingen constraint ändå.
            warnings.add("Attribut '" + attribute.getRmAttributeName()
                + "' saknade barn efter flattening — hoppade över (annars EHRbase OPTParser-krasch).");
            return null;
        }
        Element el = el("attributes");
        boolean multiple = attribute.isMultiple();
        setXsiType(el, multiple ? "C_MULTIPLE_ATTRIBUTE" : "C_SINGLE_ATTRIBUTE");
        el.appendChild(simple("rm_attribute_name", attribute.getRmAttributeName()));
        el.appendChild(intervalElement("existence", attribute.getExistence()));
        for (CObject child : attribute.getChildren()) {
            el.appendChild(buildChild(child));
        }
        if (multiple) {
            Cardinality cardinality = attribute.getCardinality();
            if (cardinality != null) {
                el.appendChild(cardinalityElement(cardinality.isOrdered(), cardinality.isUnique(), cardinality.getInterval()));
            } else {
                el.appendChild(cardinalityElement(false, false, zeroToUnbounded()));
            }
        }
        return el;
    }

    private Element buildChild(CObject child) {
        if (child instanceof CComplexObject) {
            CComplexObject complex = (CComplexObject) child;
            // collectTerm måste köras oavsett vilken gren nedan hanterar
            // resten av noden — tryBuildDvQuantity returnerar tidigt vid
            // lyckad C_DV_QUANTITY-serialisering och skulle annars hoppa
            // över noden egen term_definitions-post (regressionsfynd
            // 2026-09-10, fångat av everyRealNodeIdHasAMatchingTermDefinition).
            collectTerm(complex.getNodeId(), complex);
            Element dvQuantity = tryBuildDvQuantity(complex);
            if (dvQuantity != null) {
                return dvQuantity;
            }
            Element el = el("children");
            setXsiType(el, "C_COMPLEX_OBJECT");
            el.appendChild(simple("rm_type_name", complex.getRmTypeName()));
            el.appendChild(intervalElement("occurrences", complex.getOccurrences()));
            el.appendChild(nodeIdElement(complex.getNodeId()));
            for (CAttribute attribute : complex.getAttributes()) {
                appendIfPresent(el, buildAttribute(attribute));
            }
            return el;
        }
        if (child instanceof CTerminologyCode) {
            return buildTerminologyCodeChild((CTerminologyCode) child);
        }
        if (child instanceof ArchetypeSlot) {
            return buildArchetypeSlotChild((ArchetypeSlot) child);
        }
        // Övriga primitiver (CString/CInteger/CReal/CBoolean/CDate/CDateTime/CDuration/CTime
        // som INTE är del av ett DV_QUANTITY magnitude/units-par): vidga till obegränsad.
        // Strukturen (typ, occurrences, node_id) bevaras — värdebegränsningen tappas.
        // Se klassens Javadoc: dokumenterad P3.0c-lucka, inte en gissning som göms.
        String rmType = child.getRmTypeName();
        String xsiType = mapPrimitiveXsiType(child);
        warnings.add("Constraint-detalj vidgad till obegränsad för " + xsiType
            + " (rm_type=" + rmType + ") vid node_id=" + child.getNodeId());
        Element el = el("children");
        setXsiType(el, xsiType);
        el.appendChild(simple("rm_type_name", rmType));
        el.appendChild(intervalElement("occurrences", child.getOccurrences()));
        el.appendChild(nodeIdElement(child.getNodeId()));
        collectTerm(child.getNodeId(), child);
        return el;
    }

    private String mapPrimitiveXsiType(CObject child) {
        String simpleName = child.getClass().getSimpleName();
        switch (simpleName) {
            case "CString": return "C_STRING";
            case "CInteger": return "C_INTEGER";
            case "CReal": return "C_REAL";
            case "CBoolean": return "C_BOOLEAN";
            case "CDate": return "C_DATE";
            case "CDateTime": return "C_DATE_TIME";
            case "CDuration": return "C_DURATION";
            case "CTime": return "C_TIME";
            default: return "C_COMPLEX_OBJECT";
        }
    }

    /**
     * RM-typ-specialfall (inte arketyp-specifikt — gäller ALLA arketyper som
     * använder DV_QUANTITY): archie normaliserar ADL 1.4:s C_DV_QUANTITY till
     * en generisk CComplexObject(rm_type_name=DV_QUANTITY) med magnitude/units
     * som vanliga CAttribute-barn (verifierat mot archies källkod,
     * Adl14CComplexObjectParser.parseCDVQuantity). Vi läser tillbaka
     * magnitude-intervallet och enhetssträngen och serialiserar dem som ett
     * riktigt C_DV_QUANTITY/list-block (samma form som opt-primitives.ts
     * dvQuantity()) istället för att generiskt vidga bort dem — annars
     * skulle mätvärdesarketyperna (temp/puls/blodtryck) tappa sina enheter.
     * Om strukturen inte matchar det enkla en-enhets-fallet: returnera null
     * (anroparen faller tillbaka på det generiska, obegränsade fallet).
     */
    private Element tryBuildDvQuantity(CComplexObject complex) {
        if (!"DV_QUANTITY".equals(complex.getRmTypeName())) {
            return null;
        }

        List<Element> listItems = new ArrayList<>();
        CAttribute magnitudeAttr = complex.getAttribute("magnitude");
        CAttribute unitsAttr = complex.getAttribute("units");
        if (magnitudeAttr != null && unitsAttr != null
            && magnitudeAttr.getChildren().size() == 1 && unitsAttr.getChildren().size() == 1) {
            // Enkel-enhets-fallet: magnitude/units är vanliga CAttribute-par
            // (se Adl14CComplexObjectParser.parseCDVQuantity, en-post-grenen).
            Element item = buildQuantityListItem(magnitudeAttr.getChildren().get(0), unitsAttr.getChildren().get(0));
            if (item != null) {
                listItems.add(item);
            }
        } else {
            // Flera-enheter-fallet: samma parser lägger då constrainten i en
            // CAttributeTuple (magnitude+units hör ihop radvis) istället för
            // vanliga CAttribute — en post per tillåten enhet (P3.0c, fixat
            // 2026-09-10; tidigare vidgades detta helt utan att ens en
            // varning loggades, eftersom getAttributeTuples() aldrig lästes).
            for (CAttributeTuple tuple : complex.getAttributeTuples()) {
                int magnitudeIdx = tuple.getMemberIndex("magnitude");
                int unitsIdx = tuple.getMemberIndex("units");
                if (magnitudeIdx < 0 || unitsIdx < 0) {
                    continue;
                }
                for (CPrimitiveTuple row : tuple.getTuples()) {
                    Element item = buildQuantityListItem(row.getMember(magnitudeIdx), row.getMember(unitsIdx));
                    if (item != null) {
                        listItems.add(item);
                    }
                }
            }
        }

        if (listItems.isEmpty()) {
            warnings.add("DV_QUANTITY vid node_id=" + complex.getNodeId()
                + " gav inga tolkningsbara list-poster — vidgad till obegränsad."
                + " P3.0c-uppföljning kvarstår för denna specifika struktur.");
            return null;
        }

        Element el = el("children");
        setXsiType(el, "C_DV_QUANTITY");
        el.appendChild(simple("rm_type_name", "DV_QUANTITY"));
        el.appendChild(intervalElement("occurrences", complex.getOccurrences()));
        el.appendChild(nodeIdElement(complex.getNodeId()));
        for (Element item : listItems) {
            el.appendChild(item);
        }
        return el;
    }

    /** Bygger ETT {@code <list>}-element (magnitude+units) för C_DV_QUANTITY. Returnerar null om paret inte är CReal/CString. */
    private Element buildQuantityListItem(CObject magnitudeChild, CObject unitsChild) {
        if (!(magnitudeChild instanceof CReal) || !(unitsChild instanceof CString)) {
            return null;
        }
        List<Interval<Double>> magnitudeConstraint = ((CReal) magnitudeChild).getConstraint();
        List<String> unitsConstraint = ((CString) unitsChild).getConstraint();
        if (magnitudeConstraint == null || magnitudeConstraint.isEmpty()
            || unitsConstraint == null || unitsConstraint.isEmpty()) {
            return null;
        }
        Element list = el("list");
        Element magnitudeEl = el("magnitude");
        appendMagnitudeIntervalFields(magnitudeEl, magnitudeConstraint.get(0));
        list.appendChild(magnitudeEl);
        list.appendChild(simple("units", unitsConstraint.get(0)));
        return list;
    }

    /**
     * CTerminologyCode (kodade fält, t.ex. defining_code/criticality/status):
     * archies constraint-lista innehåller kod-strängar, ofta i formen
     * "terminologi::kod". Vi återanvänder dem som terminology_id/code_list
     * istället för att vidga bort dem helt — bevarar de faktiska tillåtna
     * koderna från ADL-källan.
     */
    private Element buildTerminologyCodeChild(CTerminologyCode code) {
        List<String> constraint = code.getConstraint();
        String terminology = "local";
        List<String> codes = new ArrayList<>();
        if (constraint != null) {
            for (String raw : constraint) {
                if (raw == null) continue;
                int sep = raw.indexOf("::");
                if (sep > 0) {
                    terminology = raw.substring(0, sep);
                    codes.add(raw.substring(sep + 2));
                } else {
                    codes.add(raw);
                }
            }
        }
        if (codes.isEmpty()) {
            warnings.add("CTerminologyCode vid node_id=" + code.getNodeId()
                + " saknade constraint-lista — vidgad till obegränsad code_phrase.");
        }
        for (String c : codes) {
            collectTermForCode(c);
        }
        return buildCodePhrase(terminology, codes);
    }

    /**
     * EHRbase:s egen OPTParser slår upp etiketten för ett kod-VÄRDE (t.ex.
     * "at9000" i en ism_transition/careflow_step-lista) via
     * termDefinitionMap.get(kodsträngen) — INTE via nodens egen node_id.
     * Utan en term_definitions-post keyad på exakt kod-strängen (samma
     * sträng som hamnar i &lt;code_list&gt;) lämnas EHRbase:s
     * {@code WebTemplateInput.getList()} tom, vilket kraschar
     * ISM_TRANSITION-specialhanteringen i {@code OPTParser.
     * parseComplexObjectSingle} med en IndexOutOfBoundsException
     * ({@code .getInputs().get(0).getList().get(0)}). Hittad genom att
     * jämföra mot web-template-sdk:ns källkod (2.31.0) — inte gissad.
     * Detta är skilt från {@link #collectTerm(String, CObject)}, som
     * indexerar på strukturell node_id för nodens EGEN etikett.
     */
    private void collectTermForCode(String code) {
        if (code == null || sourceArchetype == null) {
            return;
        }
        try {
            var terminology = sourceArchetype.getTerminology();
            if (terminology == null) {
                return;
            }
            var term = terminology.getTermDefinition("en", code);
            if (term != null) {
                termDefinitions.putIfAbsent(code, new String[]{
                    term.getText() != null ? term.getText() : code,
                    term.getDescription() != null ? term.getDescription() : "",
                });
            } else {
                warnings.add("Ingen term_definition hittades för kodvärde=" + code
                    + " — EHRbase:s webtemplate kan sakna etikett/lista för detta värde.");
            }
        } catch (RuntimeException e) {
            warnings.add("Kunde inte slå upp term_definition för kodvärde=" + code + ": " + e.getMessage());
        }
    }

    /**
     * ArchetypeSlot ({@code allow_archetype}/{@code use_archetype}-slots i ADL,
     * t.ex. inbäddade CLUSTER-arketyper för "environmental conditions"): denna
     * första version av bryggan bevarar INTE include/exclude-mönstren (regex
     * på tillåtna arketyp-id:n) — bara att en slot finns, med rätt
     * occurrences/node_id. En riktig slot-fyllning kräver ytterligare en
     * arketyp (den som slotten pekar på) och är en P3.0c-uppföljning.
     * Att strukturellt IGENKÄNNA slotten (istället för att av misstag
     * beskriva den som C_COMPLEX_OBJECT) håller OPT:en schema-korrekt.
     */
    private Element buildArchetypeSlotChild(ArchetypeSlot slot) {
        warnings.add("ArchetypeSlot vid node_id=" + slot.getNodeId()
            + " serialiserad utan include/exclude-mönster (tom slot) — P3.0c-uppföljning.");
        Element el = el("children");
        setXsiType(el, "C_ARCHETYPE_SLOT");
        el.appendChild(simple("rm_type_name", slot.getRmTypeName()));
        el.appendChild(intervalElement("occurrences", slot.getOccurrences()));
        el.appendChild(nodeIdElement(slot.getNodeId()));
        collectTerm(slot.getNodeId(), slot);
        return el;
    }

    private Element buildCodePhrase(String terminology, List<String> codes) {
        Element el = el("children");
        setXsiType(el, "C_CODE_PHRASE");
        el.appendChild(simple("rm_type_name", "CODE_PHRASE"));
        el.appendChild(intervalElement("occurrences", boundedOne()));
        el.appendChild(nodeIdElement(null));
        Element terminologyIdEl = el("terminology_id");
        terminologyIdEl.appendChild(simple("value", terminology));
        el.appendChild(terminologyIdEl);
        // <code_list> är en repeterad text-nod PER kod (t.ex. <code_list>433</code_list>),
        // INTE en nested <value>-wrapper — verifierat mot den kända referens-
        // fixturen ehrbase-test-time-series.opt. Ett tidigare försök med
        // nested <value> gjorde att EHRbase:s webtemplate-byggare läste in
        // hela textinnehållet (inkl. pretty-print-whitespace) som kodvärdet
        // (upptäckt via GET .../definition/template/adl1.4/<id>: koden kom
        // ut som "\n  433\n  " istället för "433").
        for (String code : codes) {
            el.appendChild(simple("code_list", code));
        }
        return el;
    }

    // --- Ontologi / term_definitions ---------------------------------------

    /**
     * Registrerar en term_definitions-post för varje NOD MED RIKTIGT node_id
     * — inte bara de där {@code getMeaning()}/{@code getDescription()}
     * lyckas. Empiriskt verifierat ikväll mot lokal EHRbase 2.30.1: saknas
     * en term_definitions-post för EN enda refererad kod (t.ex. för att
     * archies {@code CObject.getTerm()} tyst returnerar null för djupt
     * nästlade noder vars arketyp-bakreferens inte är satt av Flattener),
     * kraschar EHRbase:s {@code OPTParser.buildNode} med en NPE vid
     * malluppladdning. Fallback-text (nodeId självt) är sämre än en riktig
     * etikett men bättre än en trasig mall.
     */
    private void collectTerm(String nodeId, CObject object) {
        if (nodeId == null) {
            return;
        }
        String meaning = null;
        String description = null;
        try {
            meaning = object.getMeaning();
            description = object.getDescription();
        } catch (RuntimeException e) {
            warnings.add("Kunde inte slå upp term för node_id=" + nodeId + ": " + e.getMessage());
        }
        if (meaning == null) {
            warnings.add("Ingen etikett hittad för node_id=" + nodeId + " — föll tillbaka på node_id som text.");
        }
        termDefinitions.putIfAbsent(nodeId, new String[]{
            meaning != null ? meaning : nodeId,
            description != null ? description : "",
        });
    }

    private List<Element> buildTermDefinitionElements() {
        List<Element> result = new ArrayList<>();
        for (var entry : termDefinitions.entrySet()) {
            result.add(termDefinitionElement(entry.getKey(), entry.getValue()[0], entry.getValue()[1]));
        }
        return result;
    }

    private Element termDefinitionElement(String code, String text, String description) {
        Element el = el("term_definitions");
        el.setAttribute("code", code);
        Element descItem = el("items");
        descItem.setAttribute("id", "description");
        descItem.setTextContent(description != null ? description : "");
        el.appendChild(descItem);
        Element textItem = el("items");
        textItem.setAttribute("id", "text");
        textItem.setTextContent(text != null ? text : code);
        el.appendChild(textItem);
        return el;
    }

    // --- Interval/cardinality-hjälpare (matchar opt-primitives.ts exakt) ---

    private MultiplicityInterval boundedOne() {
        return new MultiplicityInterval(1, 1);
    }

    private MultiplicityInterval zeroToOne() {
        return new MultiplicityInterval(0, 1);
    }

    private MultiplicityInterval zeroToUnbounded() {
        return MultiplicityInterval.createUpperUnbounded(0);
    }

    private MultiplicityInterval zeroToUnboundedInterval() {
        return MultiplicityInterval.createUpperUnbounded(0);
    }

    private Element intervalElement(String name, Interval<Integer> interval) {
        if (interval == null) {
            interval = boundedOne();
        }
        Element el = el(name);
        boolean lowerUnbounded = interval.isLowerUnbounded();
        boolean upperUnbounded = interval.isUpperUnbounded();
        el.appendChild(simple("lower_included", String.valueOf(!lowerUnbounded ? interval.isLowerIncluded() : false)));
        el.appendChild(simple("upper_included", String.valueOf(!upperUnbounded)));
        el.appendChild(simple("lower_unbounded", String.valueOf(lowerUnbounded)));
        el.appendChild(simple("upper_unbounded", String.valueOf(upperUnbounded)));
        if (!lowerUnbounded && interval.getLower() != null) {
            el.appendChild(simple("lower", String.valueOf(interval.getLower())));
        }
        if (!upperUnbounded && interval.getUpper() != null) {
            el.appendChild(simple("upper", String.valueOf(interval.getUpper())));
        }
        return el;
    }

    /** Fyller lower_included/upper_included/lower_unbounded/upper_unbounded/lower/upper direkt på `parent` (Double-variant av {@link #intervalElement}, för DV_QUANTITY-magnitude). */
    private void appendMagnitudeIntervalFields(Element parent, Interval<Double> interval) {
        boolean lowerUnbounded = interval.isLowerUnbounded();
        boolean upperUnbounded = interval.isUpperUnbounded();
        parent.appendChild(simple("lower_included", String.valueOf(!lowerUnbounded && interval.isLowerIncluded())));
        parent.appendChild(simple("upper_included", String.valueOf(!upperUnbounded && interval.isUpperIncluded())));
        parent.appendChild(simple("lower_unbounded", String.valueOf(lowerUnbounded)));
        parent.appendChild(simple("upper_unbounded", String.valueOf(upperUnbounded)));
        if (!lowerUnbounded && interval.getLower() != null) {
            parent.appendChild(simple("lower", String.valueOf(interval.getLower())));
        }
        if (!upperUnbounded && interval.getUpper() != null) {
            parent.appendChild(simple("upper", String.valueOf(interval.getUpper())));
        }
    }

    private Element cardinalityElement(boolean ordered, boolean unique, MultiplicityInterval interval) {
        Element el = el("cardinality");
        el.appendChild(simple("is_ordered", String.valueOf(ordered)));
        el.appendChild(simple("is_unique", String.valueOf(unique)));
        el.appendChild(intervalElement("interval", interval));
        return el;
    }

    private Element nodeIdElement(String nodeId) {
        Element el = el("node_id");
        if (nodeId != null) {
            el.setTextContent(nodeId);
        }
        return el;
    }

    private Element valueWrap(String elementName, String value) {
        Element wrapper = el(elementName);
        wrapper.appendChild(simple("value", value));
        return wrapper;
    }

    private Element simple(String name, String textContent) {
        Element el = el(name);
        if (textContent != null) {
            el.setTextContent(textContent);
        }
        return el;
    }

    private Element el(String name) {
        return doc.createElementNS(OE_NS, name);
    }

    private void appendIfPresent(Element parent, Element child) {
        if (child != null) {
            parent.appendChild(child);
        }
    }

    private void setXsiType(Element el, String type) {
        el.setAttributeNS(XSI_NS, "xsi:type", type);
    }

    private String serialize() {
        try {
            TransformerFactory tf = TransformerFactory.newInstance();
            tf.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            Transformer transformer = tf.newTransformer();
            transformer.setOutputProperty(OutputKeys.OMIT_XML_DECLARATION, "no");
            transformer.setOutputProperty(OutputKeys.ENCODING, "UTF-8");
            transformer.setOutputProperty(OutputKeys.INDENT, "yes");
            transformer.setOutputProperty("{http://xml.apache.org/xslt}indent-amount", "2");
            StringWriter writer = new StringWriter();
            transformer.transform(new DOMSource(doc), new StreamResult(writer));
            return writer.toString();
        } catch (TransformerException e) {
            throw new IllegalStateException("Kunde inte serialisera OPT-XML", e);
        }
    }
}
