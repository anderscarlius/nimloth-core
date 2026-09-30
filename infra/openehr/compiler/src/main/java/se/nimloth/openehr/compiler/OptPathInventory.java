package se.nimloth.openehr.compiler;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Builds a stable, sorted path inventory from OPT 1.4 XML for regression diffing (MF2).
 *
 * <p>Paths combine {@code rm_attribute_name} segments with {@code node_id} brackets where
 * the node id is a non-empty archetype id (typically {@code at####}). UIDs and volatile
 * metadata are excluded.</p>
 */
public final class OptPathInventory {

    private OptPathInventory() {}

    public static List<String> fromOptXml(String optXml) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        Document doc = dbf.newDocumentBuilder().parse(new InputSource(new StringReader(optXml)));

        Element definition = firstChildElement(doc.getDocumentElement(), "definition");
        if (definition == null) {
            throw new IllegalArgumentException("OPT saknar <definition>");
        }

        Set<String> paths = new LinkedHashSet<>();
        walk(definition, "", paths);
        List<String> sorted = new ArrayList<>(paths);
        Collections.sort(sorted);
        return sorted;
    }

    private static void walk(Element node, String prefix, Set<String> out) {
        String nodeId = textOfDirectChild(node, "node_id");
        String path = prefix;
        if (nodeId != null && !nodeId.isBlank() && nodeId.startsWith("at")) {
            path = prefix.isEmpty() ? "[" + nodeId + "]" : prefix + "[" + nodeId + "]";
            out.add(path);
        }

        NodeList children = node.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            Element el = (Element) child;
            String local = el.getLocalName() != null ? el.getLocalName() : el.getTagName();

            if ("attributes".equals(local)) {
                String attrName = textOfDirectChild(el, "rm_attribute_name");
                if (attrName != null && !attrName.isBlank()) {
                    String nextPrefix = path.isEmpty() ? "/" + attrName : path + "/" + attrName;
                    out.add(nextPrefix);
                    for (Element childObject : directChildElements(el, "children")) {
                        walk(childObject, nextPrefix, out);
                    }
                }
            } else if ("children".equals(local) && path.equals(prefix)) {
                // nested C_COMPLEX_OBJECT under same node without attribute wrapper
                walk(el, path, out);
            }
        }
    }

    private static Element firstChildElement(Element parent, String localName) {
        List<Element> matches = directChildElements(parent, localName);
        return matches.isEmpty() ? null : matches.get(0);
    }

    private static List<Element> directChildElements(Element parent, String localName) {
        List<Element> out = new ArrayList<>();
        NodeList nodes = parent.getChildNodes();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node n = nodes.item(i);
            if (n.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            Element el = (Element) n;
            String local = el.getLocalName() != null ? el.getLocalName() : el.getTagName();
            if (localName.equals(local)) {
                out.add(el);
            }
        }
        return out;
    }

    private static String textOfDirectChild(Element parent, String localName) {
        Element child = firstChildElement(parent, localName);
        if (child == null) {
            return null;
        }
        String text = child.getTextContent();
        return text != null ? text.trim() : null;
    }
}
