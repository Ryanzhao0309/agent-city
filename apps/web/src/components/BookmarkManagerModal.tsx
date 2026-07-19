import { useEffect, useState } from "react";
import { useCityStore } from "../store/cityStore";
import type { BookmarkGroup, BookmarkItem } from "../types";
import { getAssignedResident } from "../data/npcCatalog";
import { getCharacterDisplayName } from "../utils/agentStatus";
import { BuildingAgentGuide } from "./BuildingAgentGuide";

type BookmarkViewMode = "cards" | "manage";

const BOOKMARK_VIEW_MODE_STORAGE_KEY = "agent-city:bookmark-view-mode";

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createBookmark(): BookmarkItem {
  return { id: createId("bookmark"), title: "", url: "", note: "" };
}

function cloneGroups(groups: BookmarkGroup[]): BookmarkGroup[] {
  return groups.map((group) => ({
    ...group,
    bookmarks: group.bookmarks.map((bookmark) => ({ ...bookmark })),
  }));
}

function readStoredViewMode(): BookmarkViewMode {
  try {
    return window.localStorage.getItem(BOOKMARK_VIEW_MODE_STORAGE_KEY) === "manage"
      ? "manage"
      : "cards";
  } catch {
    return "cards";
  }
}

function getBookmarkLink(bookmark: BookmarkItem): {
  href: string;
  hostname: string;
  faviconUrl: string | null;
} | null {
  const rawUrl = bookmark.url.trim();
  if (!rawUrl) return null;

  const normalizedUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
  try {
    const parsed = new URL(normalizedUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return {
      href: parsed.href,
      hostname: parsed.hostname.replace(/^www\./i, "") || rawUrl,
      faviconUrl: `${parsed.origin}/favicon.ico`,
    };
  } catch {
    return null;
  }
}

function BookmarkBrowseCard({ bookmark }: { bookmark: BookmarkItem }) {
  const [iconFailed, setIconFailed] = useState(false);
  const link = getBookmarkLink(bookmark);
  if (!link) return null;

  const fallback = (bookmark.title.trim() || link.hostname).slice(0, 1).toUpperCase();
  return (
    <a
      className="bookmark-browse-card"
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      title={bookmark.note?.trim() || `打开 ${bookmark.title || link.hostname}`}
    >
      <span className="bookmark-browse-card__icon" aria-hidden="true">
        {!iconFailed && link.faviconUrl ? (
          <img
            src={link.faviconUrl}
            alt=""
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span>{fallback}</span>
        )}
      </span>
      <strong className="bookmark-browse-card__title">
        {bookmark.title.trim() || link.hostname}
      </strong>
      <span className="bookmark-browse-card__domain">{link.hostname}</span>
    </a>
  );
}

export function BookmarkManagerModal() {
  const buildingId = useCityStore((s) => s.bookmarkManagerBuildingId);
  const buildings = useCityStore((s) => s.buildings);
  const buildingBookmarks = useCityStore((s) => s.buildingBookmarks);
  const closeBookmarkManager = useCityStore((s) => s.closeBookmarkManager);
  const updateBuildingBookmarks = useCityStore((s) => s.updateBuildingBookmarks);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const openCharacterLibrary = useCityStore((s) => s.openCharacterLibrary);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const openCharacterChat = useCityStore((s) => s.openCharacterChat);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const save = useCityStore((s) => s.save);
  const building = buildings.find((item) => item.id === buildingId);
  const [groups, setGroups] = useState<BookmarkGroup[]>([]);
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BookmarkViewMode>(readStoredViewMode);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!buildingId) return;
    const savedGroups = buildingBookmarks[buildingId] ?? [
      { id: createId("group"), name: "常用", bookmarks: [] },
    ];
    setGroups(cloneGroups(savedGroups));
    setEditingBookmarkId(null);
    setCollapsedGroupIds(new Set());
  }, [buildingBookmarks, buildingId]);

  useEffect(() => {
    try {
      window.localStorage.setItem(BOOKMARK_VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {
      // View preferences are optional when storage is unavailable.
    }
  }, [viewMode]);

  useEffect(() => {
    if (!buildingId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") closeBookmarkManager();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [buildingId, closeBookmarkManager]);

  if (!buildingId || !building) return null;
  const activeBuilding = building;
  const resident = getAssignedResident(activeBuilding, buildingResidents, customCharacters);
  const residentConfig = resident ? characterConfigs[resident.id] : undefined;

  function updateGroup(groupId: string, patch: Partial<BookmarkGroup>) {
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? { ...group, ...patch } : group))
    );
  }

  function updateBookmark(groupId: string, bookmarkId: string, patch: Partial<BookmarkItem>) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? {
              ...group,
              bookmarks: group.bookmarks.map((bookmark) =>
                bookmark.id === bookmarkId ? { ...bookmark, ...patch } : bookmark
              ),
            }
          : group
      )
    );
  }

  function addGroup() {
    setGroups((current) => [
      ...current,
      { id: createId("group"), name: `分组 ${current.length + 1}`, bookmarks: [] },
    ]);
  }

  function addBookmark(groupId: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, bookmarks: [...group.bookmarks, createBookmark()] }
          : group
      )
    );
  }

  function deleteGroup(groupId: string) {
    setGroups((current) => current.filter((group) => group.id !== groupId));
  }

  function deleteBookmark(groupId: string, bookmarkId: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id === groupId
          ? { ...group, bookmarks: group.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId) }
          : group
      )
    );
  }

  function handleSave() {
    const cleaned = groups
      .map((group) => ({
        ...group,
        name: group.name.trim() || "未命名分组",
        bookmarks: group.bookmarks
          .map((bookmark) => ({
            ...bookmark,
            title: bookmark.title.trim() || bookmark.url.trim() || "未命名书签",
            url: bookmark.url.trim(),
            note: bookmark.note?.trim() ?? "",
          }))
          .filter((bookmark) => bookmark.url),
      }))
      .filter((group) => group.name || group.bookmarks.length);
    updateBuildingBookmarks(activeBuilding.id, cleaned);
    void save();
    closeBookmarkManager();
  }

  function editBuilding() {
    selectBuilding(activeBuilding.id);
  }

  function toggleGroup(groupId: string) {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <div style={overlayStyle} onClick={closeBookmarkManager}>
      <section
        data-ui-surface="panel"
        style={{ ...modalStyle, width: viewMode === "cards" ? "min(1280px, 96vw)" : modalStyle.width }}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>书签大厅</div>
            <h2 style={titleStyle}>{activeBuilding.name}</h2>
          </div>
          <div style={headerActionsStyle}>
            <div className="bookmark-view-switch" role="group" aria-label="书签显示方式">
              <button
                className={viewMode === "cards" ? "is-active" : ""}
                onClick={() => setViewMode("cards")}
                aria-pressed={viewMode === "cards"}
              >
                卡片
              </button>
              <button
                className={viewMode === "manage" ? "is-active" : ""}
                onClick={() => setViewMode("manage")}
                aria-pressed={viewMode === "manage"}
              >
                管理
              </button>
            </div>
            <button style={editBtnStyle} onClick={editBuilding}>
              编辑建筑
            </button>
            <button style={closeBtnStyle} onClick={closeBookmarkManager} aria-label="关闭书签大厅">
              ×
            </button>
          </div>
        </header>

        <div style={bodyStyle}>
          {resident ? (
            <BuildingAgentGuide
              resident={resident}
              name={getCharacterDisplayName(resident, residentConfig)}
              role={resident.role}
              spriteUrl={resident.spriteUrl}
              accent={resident.accent}
              message="这里是书签管理大厅。你可以把网站按用途分组，Agent 会在聊天时读取这些书签，帮你找入口、解释用途和整理分类。"
              onChat={() => openCharacterChat(resident.id)}
              onConfigure={() => openCharacterConfig(resident.id)}
              onChange={() => openCharacterLibrary(activeBuilding.id)}
            />
          ) : (
            <section style={emptyStyle}>
              还没有为这个书签大厅分配 Agent。先设置 Agent 后，就可以配置 AI Brain 和打开聊天。
              <button style={{ ...secondaryBtnStyle, marginLeft: 10 }} onClick={() => openCharacterLibrary(activeBuilding.id)}>
                设置 Agent
              </button>
            </section>
          )}

          {viewMode === "cards" ? (
            <div className="bookmark-browse-groups">
              {groups.map((group) => {
                const collapsed = collapsedGroupIds.has(group.id);
                const visibleBookmarks = group.bookmarks.filter((bookmark) => getBookmarkLink(bookmark));
                return (
                  <section key={group.id} className="bookmark-browse-group">
                    <button
                      className="bookmark-browse-group__header"
                      onClick={() => toggleGroup(group.id)}
                      aria-expanded={!collapsed}
                    >
                      <span className="bookmark-browse-group__chevron" aria-hidden="true">
                        {collapsed ? "›" : "⌄"}
                      </span>
                      <strong>{group.name || "未命名分组"}</strong>
                      <span>{visibleBookmarks.length} 个书签</span>
                    </button>
                    {!collapsed && (
                      visibleBookmarks.length ? (
                        <div className="bookmark-browse-grid">
                          {visibleBookmarks.map((bookmark) => (
                            <BookmarkBrowseCard key={bookmark.id} bookmark={bookmark} />
                          ))}
                        </div>
                      ) : (
                        <div className="bookmark-browse-empty">
                          <span>这个分组还没有可显示的书签。</span>
                          <button onClick={() => setViewMode("manage")}>去管理书签</button>
                        </div>
                      )
                    )}
                  </section>
                );
              })}
              {!groups.length && (
                <div className="bookmark-browse-empty">
                  <span>还没有分组和书签。</span>
                  <button onClick={() => setViewMode("manage")}>开始添加</button>
                </div>
              )}
            </div>
          ) : (
            <>
              {groups.map((group) => (
                <section key={group.id} style={groupStyle}>
                  <div style={groupHeaderStyle}>
                    <input
                      style={groupNameStyle}
                      value={group.name}
                      placeholder="分组名称"
                      onChange={(event) => updateGroup(group.id, { name: event.target.value })}
                    />
                    <button style={secondaryBtnStyle} onClick={() => addBookmark(group.id)}>
                      添加书签
                    </button>
                    <button style={dangerBtnStyle} onClick={() => deleteGroup(group.id)}>
                      删除分组
                    </button>
                  </div>

                  <div style={bookmarkListStyle}>
                    {group.bookmarks.map((bookmark) => (
                      <div key={bookmark.id} style={bookmarkCardStyle}>
                        <input
                          style={titleInputStyle}
                          value={bookmark.title}
                          placeholder="标题"
                          onChange={(event) =>
                            updateBookmark(group.id, bookmark.id, { title: event.target.value })
                          }
                        />
                        <input
                          style={inputStyle}
                          value={bookmark.note ?? ""}
                          placeholder="备注或用途"
                          onChange={(event) =>
                            updateBookmark(group.id, bookmark.id, { note: event.target.value })
                          }
                        />
                        <div style={bookmarkActionsStyle}>
                          <button
                            style={smallBtnStyle}
                            onClick={() => {
                              const link = getBookmarkLink(bookmark);
                              if (link) window.open(link.href, "_blank", "noopener,noreferrer");
                            }}
                          >
                            打开
                          </button>
                          <button
                            style={smallBtnStyle}
                            onClick={() =>
                              setEditingBookmarkId(editingBookmarkId === bookmark.id ? null : bookmark.id)
                            }
                          >
                            管理
                          </button>
                          <button style={dangerSmallBtnStyle} onClick={() => deleteBookmark(group.id, bookmark.id)}>
                            删除
                          </button>
                        </div>
                        {editingBookmarkId === bookmark.id && (
                          <label style={urlEditorStyle}>
                            <span style={urlLabelStyle}>书签地址</span>
                            <input
                              style={inputStyle}
                              value={bookmark.url}
                              placeholder="https://example.com"
                              onChange={(event) =>
                                updateBookmark(group.id, bookmark.id, { url: event.target.value })
                              }
                            />
                          </label>
                        )}
                      </div>
                    ))}
                    {!group.bookmarks.length && (
                      <div style={emptyStyle}>这个分组还没有书签。</div>
                    )}
                  </div>
                </section>
              ))}

              {!groups.length && <div style={emptyStyle}>还没有分组。添加一个分组开始收集链接。</div>}
            </>
          )}
        </div>

        {viewMode === "manage" && (
          <footer style={footerStyle}>
            <button style={secondaryBtnStyle} onClick={addGroup}>
              添加分组
            </button>
            <button style={primaryBtnStyle} onClick={handleSave}>
              保存书签
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "var(--ac-backdrop)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: React.CSSProperties = {
  width: "min(1040px, 96vw)",
  maxHeight: "90vh",
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.16)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: "20px 24px 18px",
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
};

const eyebrowStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "var(--ac-kicker)",
  fontWeight: 900,
};

const titleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 25,
  letterSpacing: 0,
};

const headerActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const editBtnStyle: React.CSSProperties = {
  height: 40,
  padding: "0 15px",
  borderRadius: 11,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const closeBtnStyle: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 11,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "28px",
};

const bodyStyle: React.CSSProperties = {
  padding: 18,
  overflowY: "auto",
  display: "grid",
  gap: 14,
};

const groupStyle: React.CSSProperties = {
  borderRadius: 15,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  padding: 14,
  boxShadow: "0 7px 24px rgba(15,23,42,.04)",
};

const groupHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(180px, 1fr) auto auto",
  gap: 8,
  alignItems: "center",
  marginBottom: 10,
};

const groupNameStyle: React.CSSProperties = {
  border: "none",
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
  color: "var(--ac-text)",
  padding: "6px 2px",
  fontSize: 15,
  fontWeight: 900,
  outline: "none",
};

const bookmarkListStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
};

const bookmarkCardStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(150px, 0.8fr) minmax(180px, 1fr) auto",
  gap: 7,
  alignItems: "center",
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  padding: 10,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 38,
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "7px 8px",
  fontSize: 12,
};

const titleInputStyle: React.CSSProperties = {
  ...inputStyle,
  fontWeight: 900,
};

const bookmarkActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: 6,
  justifyContent: "flex-end",
  flexWrap: "wrap",
};

const urlEditorStyle: React.CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gap: 5,
  borderRadius: 8,
  border: "1px dashed rgba(96,165,250,0.32)",
  background: "var(--ac-surface-strong)",
  padding: 8,
};

const urlLabelStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--ac-accent-text)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "7px 12px",
  borderRadius: 6,
  border: "none",
  background: "#60a5fa",
  color: "var(--ac-field)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
};

const smallBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  padding: "6px 8px",
  fontSize: 11,
};

const dangerBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  border: "1px solid rgba(220,38,38,.26)",
  background: "var(--ac-field)",
  color: "#dc2626",
};

const dangerSmallBtnStyle: React.CSSProperties = {
  ...dangerBtnStyle,
  padding: "6px 8px",
  fontSize: 11,
};

const emptyStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px dashed var(--ac-border)",
  color: "var(--ac-muted)",
  padding: 12,
  fontSize: 12,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
  padding: "12px 16px 16px",
  borderTop: "1px solid var(--ac-border)",
  background: "transparent",
};
