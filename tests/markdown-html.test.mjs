import assert from "node:assert/strict";
import test from "node:test";
import { parseSafeHtmlAnchor } from "../src/lib/markdownHtml.mjs";

test("accepts empty HTML anchors used for Markdown section links", () => {
  assert.equal(parseSafeHtmlAnchor('<a id="scene-s02"></a>'), "scene-s02");
  assert.equal(
    parseSafeHtmlAnchor('<a id="scene-s02">\n</a>'),
    "scene-s02",
  );
  assert.equal(parseSafeHtmlAnchor("  <A id='release:v2.5'></A>  "), "release:v2.5");
});

test("rejects HTML anchors with unsafe content or attributes", () => {
  assert.equal(parseSafeHtmlAnchor('<a id="scene" onclick="alert(1)"></a>'), null);
  assert.equal(parseSafeHtmlAnchor('<a href="https://example.com">link</a>'), null);
  assert.equal(parseSafeHtmlAnchor('<a id="scene"><script>alert(1)</script></a>'), null);
  assert.equal(parseSafeHtmlAnchor('<a id="scene name"></a>'), null);
});
