# Editor de Pedidos PlasNorte

Sistema responsivo para preencher pedidos, salvar histórico local e exportar em PDF, Excel ou compartilhar pelo WhatsApp.

## Executar em outra máquina

Requisitos: Node.js 20 ou superior.

```bash
npm install
npm run dev -- --port 8080
```

Acesse `http://localhost:8080/`.

Senha padrão: `2026Plasnorte2026`

## Gerar versão de produção

```bash
npm run build
```

Os arquivos serão gerados na pasta `dist`.

## Publicar na Vercel

- Framework: Vite
- Build command: `npm run build`
- Output directory: `dist`

## Observação sobre os dados

Rascunhos e os 12 pedidos do histórico ficam no armazenamento local do navegador. Eles não são sincronizados entre computadores e podem ser perdidos caso os dados do navegador sejam apagados.
