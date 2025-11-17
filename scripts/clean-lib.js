/**
 * clean-lib.js
 * Funções puras para limpeza de Markdown/MDX. Testáveis via Jest.
 */

// --- padrões de remoção global ---
const regexes = [
  // remove links internos para arquivos .md e .mdx
  /\[([^\]]+)\]\((?:\.\/|\.\.\/|\/)?[^)]+\.(?:md|mdx)\)/gi,

  // remove anchors tipo (#algo) dentro de parênteses
  /\([^\)]*#[^\)]*\)/gi,

  // remove import/export MDX
  /^import\s.+?;$/gim,
  /^export\s.+?;$/gim,

  // remove JSX <Algo />
  /<([A-Za-z0-9_-]+)(\s[^>]*)?\/?>/g,

  // remove comentários MDX {/* ... */}
  /\{\/\*[\s\S]*?\*\/\}/g,

  // remove emojis no começo de headings
  /^#+\s*[\u{1F300}-\u{1FAFF}\u{1F900}-\u{1F9FF}\u{1F600}-\u{1F64F}]+\s*/gmu,

  // remove links relativos tipo ./ e ../
  /\[([^\]]+)\]\((?:\.\/|\.\.\/)[^)]+\)/gi,
];

/**
 * Normaliza blocos de código: converte ts/js → javascript e remove parâmetros extras.
 */
function normalizeCodeBlocks(content) {
  return content
    .replace(/```(js|ts)\b/g, "```javascript")
    .replace(/```[a-zA-Z0-9]+\s+[^\n]+/g, (m) => {
      // mantém apenas o fence inicial
      return m.split(" ")[0];
    });
}

/**
 * Remove expressões MDX { ... } fora de fenced codeblocks.
 */
function removeMdxExpressionsOutsideCodeBlocks(content) {
  const lines = content.split("\n");
  let insideCode = false;
  const out = [];

  for (let line of lines) {
    // detecta início e fim de codeblocks
    if (line.trim().startsWith("```")) {
      insideCode = !insideCode;
      out.push(line);
      continue;
    }

    if (!insideCode) {
      // remove expressões MDX { ... }
      line = line.replace(/\{[^{}\n]+\}/g, "");
    }

    out.push(line);
  }

  return out.join("\n");
}

/**
 * Limpa conteúdo completo.
 */
function cleanContent(content) {
  let result = content;

  // 1 — remover expressões MDX fora de codeblocks
  result = removeMdxExpressionsOutsideCodeBlocks(result);

  // 2 — aplicar regexes globais
  for (const r of regexes) {
    result = result.replace(r, "");
  }

  // 3 — normalizar codeblocks
  result = normalizeCodeBlocks(result);

  // 4 — limpeza final
  result = result.replace(/\n{3,}/g, "\n\n"); // colapsa quebras extras
  result = result.replace(/[ \t]+$/gm, "");  // tira espaços à direita
  result = result.replace(/^#+\s*$/gm, "");  // headings vazios

  return result.trim() + "\n";
}

module.exports = {
  cleanContent,
  normalizeCodeBlocks,
  removeMdxExpressionsOutsideCodeBlocks,
  regexes,
};
