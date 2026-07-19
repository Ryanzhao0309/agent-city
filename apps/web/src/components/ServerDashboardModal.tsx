import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useCityStore } from "../store/cityStore";
import { apiUrl } from "../services/api";

interface ServerMetrics {
  collectedAt: string;
  host: {
    hostname: string;
    platform: string;
    arch: string;
    release: string;
    uptimeSeconds: number;
  };
  runtime: {
    node: string;
    pid: number;
    appUptimeSeconds: number;
    cwd: string;
  };
  cpu: {
    model: string;
    cores: number;
    loadAverage: number[];
  };
  memory: {
    totalMb: number;
    freeMb: number;
    usedMb: number;
    usedPercent: number;
    processRssMb: number;
    processHeapUsedMb: number;
    processHeapTotalMb: number;
  };
  services: {
    api: string;
    webClient: string;
    secretsConfigured: number;
  };
}

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (days > 0) return `${days}天 ${hours}小时`;
  if (hours > 0) return `${hours}小时 ${minutes}分钟`;
  return `${minutes}分钟`;
}

export function normalizeDashboardUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

async function fetchMetrics(): Promise<ServerMetrics> {
  const response = await fetch(apiUrl("/api/server-metrics"));
  if (!response.ok) {
    throw new Error(`服务器指标读取失败：${response.status}`);
  }
  return response.json() as Promise<ServerMetrics>;
}

export function ServerDashboardModal() {
  const open = useCityStore((s) => s.serverDashboardOpen);
  const close = useCityStore((s) => s.closeServerDashboard);
  const glanceDashboardUrl = useCityStore((s) => s.glanceDashboardUrl);
  const deviceIntegrations = useCityStore((s) => s.deviceIntegrations);
  const setGlanceDashboardUrl = useCityStore((s) => s.setGlanceDashboardUrl);
  const addDeviceIntegration = useCityStore((s) => s.addDeviceIntegration);
  const updateDeviceIntegration = useCityStore((s) => s.updateDeviceIntegration);
  const removeDeviceIntegration = useCityStore((s) => s.removeDeviceIntegration);
  const saveLayout = useCityStore((s) => s.save);
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [glanceDraft, setGlanceDraft] = useState(glanceDashboardUrl);
  const [glanceError, setGlanceError] = useState<string | null>(null);
  const [deviceName, setDeviceName] = useState("");
  const [deviceUrl, setDeviceUrl] = useState("");

  async function refresh() {
    setStatus(metrics ? "idle" : "loading");
    setError(null);
    try {
      setMetrics(await fetchMetrics());
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "服务器指标读取失败。");
    }
  }

  useEffect(() => {
    if (!open) return;
    setGlanceDraft(glanceDashboardUrl);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(timer);
    // metrics only decides whether to show the loading state; polling should
    // follow the modal open lifecycle rather than every metrics update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function saveGlance() {
    const normalizedUrl = normalizeDashboardUrl(glanceDraft);
    if (normalizedUrl === null) {
      setGlanceError("请输入有效的 HTTP 或 HTTPS 地址。");
      return;
    }
    setGlanceError(null);
    setGlanceDraft(normalizedUrl);
    setGlanceDashboardUrl(normalizedUrl);
    await saveLayout();
  }

  async function addDevice() {
    if (!deviceName.trim() && !deviceUrl.trim()) return;
    addDeviceIntegration({ name: deviceName, url: deviceUrl });
    setDeviceName("");
    setDeviceUrl("");
    await saveLayout();
  }

  async function checkDevice(id: string, url: string) {
    updateDeviceIntegration(id, {
      status: /^https?:\/\//i.test(url) ? "online" : "offline",
      lastCheckedAt: new Date().toISOString(),
    });
    await saveLayout();
  }

  if (!open) return null;

  const embeddedGlanceUrl = normalizeDashboardUrl(glanceDashboardUrl);

  return (
    <div style={backdropStyle} onClick={close}>
      <div data-ui-surface="panel" style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>服务器管理大厅</div>
            <h2 style={titleStyle}>Server Dashboard</h2>
            <p style={subtitleStyle}>读取后端指标、设备接口和 Glance 面板状态。</p>
          </div>
          <button style={closeStyle} onClick={close} aria-label="Close server dashboard">
            ×
          </button>
        </header>

        {status === "loading" && !metrics ? (
          <div style={emptyStyle}>正在读取服务器指标...</div>
        ) : error && !metrics ? (
          <div style={errorStyle}>{error}</div>
        ) : metrics ? (
          <main style={bodyStyle}>
            <section style={heroGridStyle}>
              <MetricCard label="内存占用" value={`${metrics.memory.usedPercent}%`}>
                <ProgressBar value={metrics.memory.usedPercent} />
                <div style={miniTextStyle}>
                  {metrics.memory.usedMb} MB / {metrics.memory.totalMb} MB
                </div>
              </MetricCard>
              <MetricCard label="CPU 负载" value={metrics.cpu.loadAverage.join(" / ")}>
                <div style={miniTextStyle}>
                  {metrics.cpu.cores} 核 · {metrics.cpu.model}
                </div>
              </MetricCard>
              <MetricCard label="应用运行" value={formatDuration(metrics.runtime.appUptimeSeconds)}>
                <div style={miniTextStyle}>
                  PID {metrics.runtime.pid} · Node {metrics.runtime.node}
                </div>
              </MetricCard>
            </section>

            <section style={gridStyle}>
              <InfoPanel title="主机环境">
                <InfoRow label="主机名" value={metrics.host.hostname} />
                <InfoRow label="系统" value={`${metrics.host.platform} ${metrics.host.release}`} />
                <InfoRow label="架构" value={metrics.host.arch} />
                <InfoRow label="系统运行" value={formatDuration(metrics.host.uptimeSeconds)} />
              </InfoPanel>

              <InfoPanel title="进程内存">
                <InfoRow label="RSS" value={`${metrics.memory.processRssMb} MB`} />
                <InfoRow label="Heap" value={`${metrics.memory.processHeapUsedMb} / ${metrics.memory.processHeapTotalMb} MB`} />
                <InfoRow label="空闲内存" value={`${metrics.memory.freeMb} MB`} />
                <InfoRow label="工作目录" value={metrics.runtime.cwd} />
              </InfoPanel>

              <InfoPanel title="城市服务">
                <InfoRow label="API" value={metrics.services.api} positive={metrics.services.api === "ok"} />
                <InfoRow label="Web 客户端" value={metrics.services.webClient === "bundled" ? "生产打包" : "开发代理"} />
                <InfoRow label="已配置密钥" value={`${metrics.services.secretsConfigured} 个`} />
                <InfoRow label="更新时间" value={new Date(metrics.collectedAt).toLocaleTimeString()} />
              </InfoPanel>
            </section>

            <section style={panelCardStyle}>
              <h3 style={panelTitleStyle}>Glance Dashboard</h3>
              <div style={inlineFormStyle}>
                <input
                  style={inputStyle}
                  value={glanceDraft}
                  placeholder="https://your-glance-dashboard"
                  onChange={(event) => {
                    setGlanceDraft(event.target.value);
                    setGlanceError(null);
                  }}
                />
                <button style={secondaryBtnStyle} onClick={() => void saveGlance()}>保存</button>
              </div>
              {glanceError && <div style={inlineErrorStyle}>{glanceError}</div>}
              {embeddedGlanceUrl ? (
                <>
                  <div style={glanceMetaStyle}>
                    <span>正在嵌入：{embeddedGlanceUrl}</span>
                    <a href={embeddedGlanceUrl} target="_blank" rel="noreferrer" style={externalLinkStyle}>
                      新窗口打开
                    </a>
                  </div>
                  <iframe title="Glance Dashboard" src={embeddedGlanceUrl} style={iframeStyle} />
                </>
              ) : (
                <div style={miniTextStyle}>配置 Glance URL 后会在这里嵌入仪表板。</div>
              )}
            </section>

            <section style={panelCardStyle}>
              <h3 style={panelTitleStyle}>设备接口</h3>
              <div style={inlineFormStyle}>
                <input style={inputStyle} value={deviceName} placeholder="设备名称" onChange={(event) => setDeviceName(event.target.value)} />
                <input style={inputStyle} value={deviceUrl} placeholder="接口 URL" onChange={(event) => setDeviceUrl(event.target.value)} />
                <button style={secondaryBtnStyle} onClick={() => void addDevice()}>添加</button>
              </div>
              <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {deviceIntegrations.map((device) => (
                  <div key={device.id} style={deviceRowStyle}>
                    <span>{device.name}</span>
                    <small>{device.url || "no url"}</small>
                    <strong>{device.status}</strong>
                    <button style={tinyBtnStyle} onClick={() => void checkDevice(device.id, device.url)}>检查</button>
                    <button style={tinyBtnStyle} onClick={() => { removeDeviceIntegration(device.id); void saveLayout(); }}>删除</button>
                  </div>
                ))}
              </div>
            </section>

          </main>
        ) : null}

        <footer style={footerStyle}>
          {error && metrics && <span style={inlineErrorStyle}>{error}</span>}
          <button style={secondaryBtnStyle} onClick={() => void refresh()}>
            立即刷新
          </button>
        </footer>
      </div>
    </div>
  );
}

function MetricCard({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <section style={metricCardStyle}>
      <div style={metricLabelStyle}>{label}</div>
      <div style={metricValueStyle}>{value}</div>
      {children}
    </section>
  );
}

function InfoPanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={panelCardStyle}>
      <h3 style={panelTitleStyle}>{title}</h3>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </section>
  );
}

function InfoRow({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div style={rowStyle}>
      <span style={rowLabelStyle}>{label}</span>
      <span style={{ ...rowValueStyle, color: positive ? "#86efac" : "var(--ac-text-soft)" }}>{value}</span>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div style={barStyle}>
      <div style={{ ...barFillStyle, width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "rgba(2,6,23,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const modalStyle: CSSProperties = {
  width: "min(940px, 96vw)",
  maxHeight: "88vh",
  overflow: "hidden",
  borderRadius: 16,
  border: "1px solid rgba(96,165,250,0.24)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  boxShadow: "0 24px 80px rgba(0,0,0,0.46)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  padding: "22px 24px 18px",
  borderBottom: "1px solid var(--ac-border)",
  display: "flex",
  gap: 16,
};

const eyebrowStyle: CSSProperties = {
  color: "var(--ac-dashboard-heading)",
  fontSize: 12,
  fontWeight: 900,
  letterSpacing: 2,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 30,
  lineHeight: 1,
};

const subtitleStyle: CSSProperties = {
  margin: "8px 0 0",
  color: "var(--ac-muted)",
  fontSize: 13,
};

const closeStyle: CSSProperties = {
  marginLeft: "auto",
  width: 42,
  height: 42,
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 30,
  lineHeight: 1,
};

const bodyStyle: CSSProperties = {
  padding: 22,
  overflowY: "auto",
};

const heroGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
  marginBottom: 14,
};

const metricCardStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid rgba(103,232,249,0.18)",
  background: "linear-gradient(145deg, rgba(14,116,144,0.28), var(--ac-glass))",
  padding: 16,
  minHeight: 128,
};

const metricLabelStyle: CSSProperties = {
  color: "var(--ac-dashboard-heading)",
  fontSize: 12,
  fontWeight: 900,
};

const metricValueStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 26,
  fontWeight: 950,
  marginTop: 8,
  overflowWrap: "anywhere",
};

const miniTextStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 12,
  lineHeight: 1.45,
  marginTop: 10,
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 14,
};

const panelCardStyle: CSSProperties = {
  borderRadius: 14,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  padding: 14,
};

const panelTitleStyle: CSSProperties = {
  margin: "0 0 12px",
  color: "var(--ac-dashboard-heading)",
  fontSize: 15,
};

const rowStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const rowLabelStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  fontWeight: 900,
};

const rowValueStyle: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.35,
  overflowWrap: "anywhere",
};

const barStyle: CSSProperties = {
  height: 9,
  background: "var(--ac-glass)",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 12,
};

const barFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, #22d3ee, #60a5fa)",
};

const footerStyle: CSSProperties = {
  padding: "14px 22px",
  borderTop: "1px solid var(--ac-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 12,
};

const secondaryBtnStyle: CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontWeight: 900,
};

const emptyStyle: CSSProperties = {
  padding: 28,
  color: "var(--ac-text-soft)",
};

const errorStyle: CSSProperties = {
  margin: 22,
  padding: 14,
  borderRadius: 10,
  border: "1px solid rgba(248,113,113,0.35)",
  background: "rgba(127,29,29,0.28)",
  color: "#fecaca",
};

const inlineErrorStyle: CSSProperties = {
  marginRight: "auto",
  color: "#fca5a5",
  fontSize: 12,
};

const inlineFormStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto",
  gap: 8,
  alignItems: "center",
};

const inputStyle: CSSProperties = {
  minHeight: 36,
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "0 10px",
  fontWeight: 750,
  minWidth: 0,
};

const iframeStyle: CSSProperties = {
  marginTop: 12,
  width: "100%",
  height: 280,
  border: "1px solid var(--ac-border)",
  borderRadius: 8,
  background: "var(--ac-field)",
};

const glanceMetaStyle: CSSProperties = {
  marginTop: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  color: "var(--ac-muted)",
  fontSize: 11,
  overflowWrap: "anywhere",
};

const externalLinkStyle: CSSProperties = {
  flexShrink: 0,
  color: "var(--ac-dashboard-link)",
  fontWeight: 850,
  textDecoration: "none",
};

const deviceRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "140px minmax(0, 1fr) 80px auto auto",
  gap: 8,
  alignItems: "center",
  padding: 8,
  borderRadius: 8,
  background: "var(--ac-glass)",
  color: "var(--ac-text-soft)",
  fontSize: 12,
};

const tinyBtnStyle: CSSProperties = {
  minHeight: 28,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text-soft)",
  fontWeight: 850,
  cursor: "pointer",
};
