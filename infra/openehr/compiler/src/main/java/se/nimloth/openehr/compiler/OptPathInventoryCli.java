package se.nimloth.openehr.compiler;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * CLI for MF2 path-baseline checks (used from vitest and CI).
 *
 * <p>{@code --check &lt;opt-file&gt; &lt;baseline.paths.txt&gt;}</p>
 */
public final class OptPathInventoryCli {

    public static void main(String[] args) throws Exception {
        if (args.length == 3 && "--check".equals(args[0])) {
            check(Path.of(args[1]), Path.of(args[2]));
            return;
        }
        if (args.length == 1) {
            String xml = Files.readString(Path.of(args[0]), StandardCharsets.UTF_8);
            for (String path : OptPathInventory.fromOptXml(xml)) {
                System.out.println(path);
            }
            return;
        }
        System.err.println("Usage: OptPathInventoryCli <file.opt>");
        System.err.println("       OptPathInventoryCli --check <file.opt> <baseline.paths.txt>");
        System.exit(2);
    }

    private static void check(Path optFile, Path baselineFile) throws Exception {
        String xml = Files.readString(optFile, StandardCharsets.UTF_8);
        List<String> actual = OptPathInventory.fromOptXml(xml);
        Set<String> actualSet = new HashSet<>(actual);

        List<String> expected = Files.readAllLines(baselineFile, StandardCharsets.UTF_8)
            .stream()
            .map(String::trim)
            .filter(line -> !line.isEmpty() && !line.startsWith("#"))
            .toList();

        Set<String> missing = new HashSet<>();
        for (String path : expected) {
            if (!actualSet.contains(path)) {
                missing.add(path);
            }
        }

        if (!missing.isEmpty()) {
            System.err.println("Path-diff FAIL: " + missing.size() + " baseline path(s) missing from OPT:");
            int shown = 0;
            for (String path : missing) {
                System.err.println("  - " + path);
                if (++shown >= 20) {
                    if (missing.size() > 20) {
                        System.err.println("  ... and " + (missing.size() - 20) + " more");
                    }
                    break;
                }
            }
            System.exit(1);
        }
        System.out.println("Path-diff OK (" + expected.size() + " baseline paths present)");
    }
}
