import assert from "node:assert/strict";
import test from "node:test";
import { createMarkdownSegments } from "../src/lib/markdownSegments.mjs";

test("keeps ordinary Markdown in one render segment", () => {
  const markdown = "# 简介\n\n普通文档。\n";
  const segments = createMarkdownSegments(markdown);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, markdown);
  assert.equal(segments[0].headings[0].id, "简介");
});

test("splits large Markdown without changing content or stable heading ids", () => {
  const section = (title) => `## ${title}\n\n${"正文内容。".repeat(12_000)}\n\n`;
  const markdown = `# 大文档\n\n${section("重复标题")}${section("重复标题")}${section("结尾")}`;
  const segments = createMarkdownSegments(markdown);
  assert.ok(segments.length > 1);
  assert.equal(segments.map((segment) => segment.content).join(""), markdown);
  assert.deepEqual(
    segments.flatMap((segment) => segment.headings.map((heading) => heading.id)),
    ["大文档", "重复标题", "重复标题-1", "结尾"],
  );
});

test("uses UTF-8 bytes and preserves Setext and deep heading ids", () => {
  const markdown = [
    "Setext 标题",
    "===========",
    "",
    "中文段落。".repeat(5_000),
    "",
    "##### 五级标题",
    "",
    "更多中文。".repeat(5_000),
  ].join("\n");
  const segments = createMarkdownSegments(markdown);

  assert.ok(markdown.length < 64 * 1024);
  assert.ok(segments.length > 1);
  assert.equal(segments.map((segment) => segment.content).join(""), markdown);
  assert.deepEqual(
    segments.flatMap((segment) => segment.headings),
    [
      { depth: 1, text: "Setext 标题", id: "setext-标题" },
      { depth: 5, text: "五级标题", id: "五级标题" },
    ],
  );
});

test("keeps cross-document reference definitions in one segment", () => {
  const markdown = `# 引用\n\n[文档][guide]\n\n${"正文。".repeat(60_000)}\n\n[guide]: ./guide.md\n`;
  const segments = createMarkdownSegments(markdown);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].content, markdown);
});
