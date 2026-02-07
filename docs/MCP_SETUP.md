# Setup de MCP Servers para TRAIDgov Analyst

> Configuración de Model Context Protocol servers para desarrollo con Claude Code

---

## MCPs Configurados

El archivo `.mcp.json` en la raíz del proyecto define 5 MCP servers:

### 1. Context7 (Documentación de librerías)

**Tipo:** HTTP
**Propósito:** Consultar documentación actualizada de Next.js, AI SDK, Supabase, Nivo, React, etc.

```json
{
  "context7": {
    "type": "http",
    "url": "https://mcp.context7.com/mcp",
    "headers": {
      "Authorization": "Bearer ctx7sk-e904f296-3cc7-444d-a138-2f554890837c"
    }
  }
}
```

**Uso:** Cuando Claude necesite verificar la API actual de una librería.
Ejemplo: "Buscá en context7 cómo usar streamText de AI SDK 5.0"

---

### 2. Next.js DevTools

**Tipo:** stdio (npx)
**Propósito:** Debug de Next.js 16 — routing, caching, rendering, logs.

```json
{
  "next-devtools": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "-y", "next-devtools-mcp@latest"]
  }
}
```

**Requiere:** El dev server de Next.js corriendo (`npm run dev`).
**Uso:** Debugging de problemas de rendering, cache, o rutas.

---

### 3. Vercel (Deploy y gestión)

**Tipo:** HTTP
**Propósito:** Deploy, gestión de proyectos, variables de entorno, domains.

```json
{
  "vercel": {
    "type": "http",
    "url": "https://mcp.vercel.com"
  }
}
```

**Setup adicional requerido:**

1. Instalar Vercel CLI: `npm i -g vercel`
2. Login: `vercel login`
3. Generar OIDC token:
   ```bash
   vercel mcp login
   ```
4. Copiar el token generado a `.env.local`:
   ```
   VERCEL_OIDC_TOKEN=eyJ...
   ```

**Uso:** Deploy, ver logs, configurar variables de entorno.

---

### 4. Supabase (Base de datos)

**Tipo:** stdio (npx)
**Propósito:** Gestión de la base de datos, ejecutar SQL, ver tablas, gestionar RLS.

```json
{
  "supabase": {
    "type": "stdio",
    "command": "cmd",
    "args": [
      "/c", "npx", "-y",
      "@anthropic-ai/mcp-server-supabase@latest",
      "--supabase-access-token", "TU_SUPABASE_ACCESS_TOKEN"
    ]
  }
}
```

**Setup requerido:**

1. Ir a https://supabase.com/dashboard/account/tokens
2. Generar un Access Token
3. Reemplazar `TU_SUPABASE_ACCESS_TOKEN` en `.mcp.json`

**Uso:** Crear tablas, ejecutar queries, verificar RLS, ver esquema.

---

### 5. GitHub (Gestión de repos)

**Tipo:** stdio (npx)
**Propósito:** Crear issues, PRs, ver código, gestionar repos.

```json
{
  "github": {
    "type": "stdio",
    "command": "cmd",
    "args": ["/c", "npx", "-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "TU_TOKEN_GITHUB"
    }
  }
}
```

**Setup requerido:**

1. Ir a https://github.com/settings/tokens
2. Crear un Fine-grained Personal Access Token
3. Permisos: `repo`, `issues`, `pull_requests`
4. Reemplazar `TU_TOKEN_GITHUB` en `.mcp.json`

---

## Habilitación en Claude Code

El archivo `.claude/settings.local.json` habilita todos los MCPs:

```json
{
  "enabledMcpjsonServers": [
    "context7",
    "next-devtools",
    "vercel",
    "supabase",
    "github"
  ],
  "enableAllProjectMcpServers": true
}
```

## Checklist de Setup

- [ ] Configurar API key de Context7 (ya incluida)
- [ ] Generar Supabase Access Token y reemplazar en `.mcp.json`
- [ ] Generar GitHub Personal Access Token y reemplazar en `.mcp.json`
- [ ] Ejecutar `vercel mcp login` para obtener OIDC token
- [ ] Verificar que `npm run dev` funciona (para next-devtools)
- [ ] Probar cada MCP en Claude Code

## Uso durante el desarrollo

| Situación | MCP a usar |
|-----------|------------|
| Buscar API de Next.js 16 o AI SDK | context7 |
| Debug de rendering o cache | next-devtools |
| Deploy o configurar dominio | vercel |
| Crear tablas o verificar datos | supabase |
| Crear PR o gestionar issues | github |

---

*Última actualización: 2026-02-06*
