const regexes = [
  /\[([^\]]+)\]\((\.\/|\/)?[^\)]+\.(md|mdx)\)/gi,
  /\(([^\)]*#.*?)\)/gi,
  /^import .*?;$/gim,
  /^export .*?;$/gim,
  /<[^>]+>/g,
  /\{/*.*?\*\/}/gs,
  /^#+\s*[\u{1F300}-\u{1FAFF}]+\s*/gu,
  /\(#.*?\)/g,
  /\[([^\]]+)\]\((?:\.{1,2}\/)[^\)]*\)/gi,
];

function normalizeCodeBlocks(content) {
  return content
    .replace(/```(js|ts)/g, "```javascript")
    .replace(/```[a-zA-Z0-9]+\s+[^\n]+/g, (m) => m.split(" ")[0]);
}

function cleanContent(content) {
  let result = content;

  for (const r of regexes) result = result.replace(r, "");

  result = normalizeCodeBlocks(result);
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/[ \t]+$/gm, "");
  result = result.replace(/^#+\s*$/gm, "");

  return result.trim() + "\n";
}

module.exports = {
  cleanContent,
  normalizeCodeBlocks,
  regexes,
};
