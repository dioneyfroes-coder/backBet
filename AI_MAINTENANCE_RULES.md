REGRAS DE MANUTENÇÃO DO BACKBET

1. NÃO faça refatorações amplas ou mudanças arquiteturais.
2. NÃO altere interfaces, contratos, schemas, fluxos financeiros ou infraestrutura
   que não estejam diretamente relacionados ao problema solicitado.
3. NÃO substitua implementações que já funcionam apenas por considerar outra
   abordagem "mais limpa", "mais moderna" ou "mais elegante".
4. Antes de modificar código, identifique exatamente:
   - o bug/problema;
   - os arquivos envolvidos;
   - o comportamento atual;
   - o comportamento esperado.
5. Faça a menor alteração possível para resolver o problema.
6. Preserve APIs, nomes, contratos e comportamento existentes sempre que possível.
7. NÃO mova arquivos, renomeie módulos ou reorganize diretórios sem necessidade.
8. NÃO troque bibliotecas, frameworks ou versões de dependências.
9. NÃO altere o sistema financeiro inteiro para corrigir um problema localizado.
10. NÃO remova testes existentes. Se necessário, adicione testes.
11. Toda alteração deve ser acompanhada por testes que reproduzam o problema.
12. Depois da alteração, execute os testes relacionados antes de modificar outra coisa.
13. Se encontrar outro problema durante a análise, NÃO corrija automaticamente.
    Apenas registre-o como problema separado.
14. NÃO "melhore" código que não esteja quebrado ou relacionado à tarefa.
15. Se uma solução exigir alteração arquitetural significativa, PARE e explique
    a necessidade antes de implementá-la.
16. Prioridade absoluta: preservar funcionalidade existente e consistência financeira.
17. O objetivo é ESTABILIZAR o MVP, não redesenhar o projeto.