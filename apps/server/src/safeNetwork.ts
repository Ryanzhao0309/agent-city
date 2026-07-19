import dns from "node:dns/promises";
import net from "node:net";

const MAX_BODY_BYTES = 1_000_000;
const MAX_REDIRECTS = 4;

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized.startsWith("::ffff:")) {
    const mappedIpv4 = normalized.slice("::ffff:".length);
    if (net.isIP(mappedIpv4) === 4) return isPrivateIpv4(mappedIpv4);
  }
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fe80:") ||
    normalized.startsWith("fc") || normalized.startsWith("fd");
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  return family === 4 ? isPrivateIpv4(address) : family === 6 ? isPrivateIpv6(address) : true;
}

async function assertPublicUrl(url: URL, allowedHosts?: Set<string>): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("只允许 HTTP/HTTPS URL。");
  if (url.username || url.password) throw new Error("URL 不能包含用户名或密码。");
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("禁止访问本机或局域网地址。");
  }
  if (allowedHosts && !allowedHosts.has(hostname)) throw new Error(`域名 ${hostname} 不在连接器允许列表中。`);
  if (net.isIP(hostname)) {
    if (isBlockedAddress(hostname)) throw new Error("禁止访问私有、回环或保留 IP 地址。");
    return;
  }
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => isBlockedAddress(item.address))) {
    throw new Error("域名解析到了私有、回环或保留 IP 地址。");
  }
}

export async function safeFetchText(
  input: string,
  options: { allowedHosts?: string[]; timeoutMs?: number; headers?: Record<string, string>; signal?: AbortSignal } = {}
): Promise<{ url: string; status: number; contentType: string; body: string; truncated: boolean }> {
  let current = new URL(input);
  const allowedHosts = options.allowedHosts ? new Set(options.allowedHosts.map((host) => host.toLowerCase())) : undefined;
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await assertPublicUrl(current, allowedHosts);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const response = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: options.signal ? AbortSignal.any([controller.signal, options.signal]) : controller.signal,
        headers: { "User-Agent": "Agent-City-ReadOnly-Web/1.0", Accept: "text/html,text/plain,application/json", ...options.headers },
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("重定向缺少目标地址。");
        current = new URL(location, current);
        continue;
      }
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_BODY_BYTES) throw new Error("网页内容超过 1 MB 限制。");
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let body = "";
      let receivedBytes = 0;
      let truncated = false;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > MAX_BODY_BYTES) {
            truncated = true;
            await reader.cancel();
            break;
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
      return {
        url: current.toString(),
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        body,
        truncated,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("网页重定向次数过多。");
}

export interface WebSearchResult { provider: "brave" | "duckduckgo"; title: string; url: string; snippet: string; retrievedAt: string }

function decodeHtml(value: string): string {
  const entities: Record<string, string> = { "&amp;": "&", "&quot;": "\"", "&#x27;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" };
  return value.replace(/<[^>]+>/g, " ").replace(/&(amp|quot|#x27|#39|lt|gt);/g, (item) => entities[item] ?? item).replace(/\s+/g, " ").trim();
}

function duckUrl(value: string): string {
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value, "https://html.duckduckgo.com");
    return url.searchParams.get("uddg") ? decodeURIComponent(url.searchParams.get("uddg")!) : url.toString();
  } catch { return value; }
}

async function searchDuckDuckGoHtml(query: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  const response = await safeFetchText(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    allowedHosts: ["html.duckduckgo.com"], signal,
  });
  if (response.status !== 200) return [];
  const links = [...response.body.matchAll(/<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const snippets = [...response.body.matchAll(/class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div)>/gi)];
  const retrievedAt = new Date().toISOString();
  return links.slice(0, 10).map((match, index) => ({
    provider: "duckduckgo" as const,
    title: decodeHtml(match[2]),
    url: duckUrl(match[1]),
    snippet: decodeHtml(snippets[index]?.[1] ?? ""),
    retrievedAt,
  })).filter((item) => item.title && /^https?:\/\//.test(item.url));
}

async function searchBrave(query: string, apiKey: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  const response = await safeFetchText(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=10`, {
    allowedHosts: ["api.search.brave.com"], signal,
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
  });
  if (response.status !== 200) throw new Error(`Brave Search 返回 ${response.status}。`);
  const data = JSON.parse(response.body) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const retrievedAt = new Date().toISOString();
  return (data.web?.results ?? []).slice(0, 10).flatMap((item) => item.title && item.url ? [{
    provider: "brave" as const, title: item.title, url: item.url, snippet: item.description ?? "", retrievedAt,
  }] : []);
}

export async function searchWeb(query: string, options: { apiKey?: string; signal?: AbortSignal } = {}): Promise<WebSearchResult[]> {
  const q = query.trim();
  if (!q) throw new Error("搜索词不能为空。");
  if (options.apiKey) {
    try {
      const brave = await searchBrave(q, options.apiKey, options.signal);
      if (brave.length) return brave;
    } catch { /* Fall through to the no-key provider. */ }
  }
  const fallback = await searchDuckDuckGoHtml(q, options.signal);
  if (fallback.length) return fallback;
  throw new Error("网页搜索没有返回结果。请检查 Brave Search 密钥或稍后重试。");
}
