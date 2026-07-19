import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragMoveEvent, type DragStartEvent } from "@dnd-kit/core";
import { AssetLibraryModal } from "./components/BuildingLibrary";
import { CityCanvas, type DragPreview } from "./components/CityCanvas";
import { BuildingConfigPanel } from "./components/BuildingConfigPanel";
import { PlacementDock, type DockTab } from "./components/PlacementDock";
import { SkillHallModal } from "./components/SkillHallModal";
import { CharacterLibraryModal } from "./components/CharacterLibraryModal";
import { CharacterConfigModal } from "./components/CharacterConfigModal";
import { CharacterChatModal } from "./components/CharacterChatModal";
import { SettingsModal } from "./components/SettingsModal";
import { BookmarkManagerModal } from "./components/BookmarkManagerModal";
import { ServerDashboardModal } from "./components/ServerDashboardModal";
import { ThemeHallModal } from "./components/ThemeHallModal";
import { CityHallModal } from "./components/CityHallModal";
import { TodoHallModal } from "./components/TodoHallModal";
import { LayoutSchemeModal } from "./components/LayoutSchemeModal";
import { DesktopNotificationCoordinator } from "./components/DesktopNotificationCoordinator";
import { buildingTypes, useCityStore } from "./store/cityStore";
import { getPlacedBuildingSize, isoMapSize, screenToIso } from "./utils/grid";
import { getCustomBuildingSize } from "./utils/customBuildingSize";

type DragData =
  | { source: "library"; type: string }
  | { source: "building"; id: string }
  | { source: "custom-asset"; assetId: string; kind: "terrain" | "decoration" | "building" }
  | undefined;

export default function App() {
  const [showCity, setShowCity] = useState(() => window.location.hash !== "#site");

  function enterCity() {
    window.location.hash = "";
    setShowCity(true);
  }

  if (!showCity) {
    return <ProjectLanding onEnterCity={enterCity} />;
  }

  return <AgentCityExperience />;
}

function ProjectLanding({ onEnterCity }: { onEnterCity: () => void }) {
  const cityLayers = [
    {
      label: "CONTROL",
      title: "城市中枢",
      copy: "你在市政大厅规划城市、管理居民、安排建筑用途，让自己的 AI 城市按照你的工作方式生长。",
      image: "/buildings/megalithic-single-pack/01-city-hall.png",
    },
    {
      label: "AGENTS",
      title: "AI 居民",
      copy: "每个 AI 都是独一无二的城市居民：有名字、形象、住所、职责、技能和自己的工作记忆。",
      image: "/buildings/megalithic-single-pack/02-agent-cottage.png",
    },
    {
      label: "SKILLS",
      title: "能力建筑",
      copy: "不同建筑承载不同能力：写作、数据、自动化、知识库、外贸、内容生产、运维监控，都可以成为城市设施。",
      image: "/buildings/megalithic-single-pack/03-skill-shrine.png",
    },
    {
      label: "OPS",
      title: "城市扩建",
      copy: "你可以持续建造新区域、添加新居民、安装新技能、调整布局，让城市随着你的工作和想象力扩展。",
      image: "/buildings/megalithic-single-pack/05-server-ops-observatory.png",
    },
  ];

  const scenarios = [
    "你可以给每个 AI 居民设定身份：研究员、运营、设计师、数据分析师、内容编辑、自动化工程师。",
    "你可以给每栋建筑设定用途：任务大厅处理待办，档案馆管理知识，技能大厅扩展能力，服务器机房照看系统。",
    "你可以像城市规划师一样决定它们住在哪里、如何协作、服务哪些工作流，并不断把城市建得更像你自己。",
  ];

  return (
    <main className="project-site">
      <section className="project-hero" aria-labelledby="project-title">
        <nav className="project-nav" aria-label="项目导航">
          <a className="project-brand" href="#top" aria-label="Agent City 首页">
            <span className="project-brand__mark" aria-hidden="true">
              <img src="/buildings/megalithic-single-pack/01-city-hall.png" alt="" />
            </span>
            <span>Agent City</span>
          </a>
          <div className="project-nav__links">
            <a href="#concept">Concept</a>
            <a href="#platform">Platform</a>
            <a href="#future">Future</a>
          </div>
          <button type="button" className="project-nav__button" onClick={onEnterCity}>
            进入城市
          </button>
        </nav>

        <div className="project-hero__content">
          <div className="project-hero__copy">
            <p className="project-kicker">PERSONAL AI CITY</p>
            <h1 id="project-title">建造一座属于你的 AI 城市。</h1>
            <p className="project-lede">
              Agent City 不是导航页面，而是一座可以被你规划、建造和管理的个人 AI 城市。
              城市里有不同的 AI 居民，它们住在不同建筑里，负责解决不同事情。
              每一座建筑、每一个居民、每一条工作流都可以被你塑造成独一无二的样子。
            </p>
            <div className="project-hero__actions">
              <button type="button" className="project-button project-button--primary" onClick={onEnterCity}>
                进入 AI 城市
              </button>
              <a className="project-button project-button--ghost" href="#deploy">
                了解部署方式
              </a>
            </div>
            <dl className="project-stats" aria-label="项目特点">
              <div>
                <dt>Position</dt>
                <dd>个人 AI 城市</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>你是建造者</dd>
              </div>
              <div>
                <dt>World</dt>
                <dd>独一无二</dd>
              </div>
            </dl>
          </div>

          <div className="project-city-preview" aria-label="Agent City 城市预览">
            <img className="project-city-preview__scene" src="/scene-themes/megalithic-spring.png" alt="" />
            <img className="project-city-preview__building project-city-preview__building--hall" src="/buildings/megalithic-single-pack/01-city-hall.png" alt="市政大厅" />
            <img className="project-city-preview__building project-city-preview__building--agent" src="/buildings/megalithic-single-pack/02-agent-cottage.png" alt="Agent 小屋" />
            <img className="project-city-preview__building project-city-preview__building--skill" src="/buildings/megalithic-single-pack/03-skill-shrine.png" alt="技能大厅" />
            <img className="project-city-preview__npc" src="/npcs/cozy-mage.png" alt="城市居民角色" />
            <div className="project-city-preview__panel">
              <strong>你负责建城，AI 居民负责做事</strong>
              <span>每个居民都有自己的岗位，每座建筑都有自己的能力。</span>
            </div>
          </div>
        </div>
      </section>

      <section className="project-marquee" aria-label="项目关键词">
        <span>BUILD YOUR CITY</span>
        <span>UNIQUE RESIDENTS</span>
        <span>AI WORKFLOWS</span>
        <span>CITY PLANNING</span>
        <span>PERSONAL WORLD</span>
      </section>

      <section className="project-section project-section--split" id="concept">
        <div>
          <p className="project-section__eyebrow">Concept</p>
          <h2>你不是在整理工具，而是在经营一个会工作的世界。</h2>
        </div>
        <div className="project-section__body">
          <p>
            很多 AI 产品把 Agent 做成列表、卡片或聊天窗口。Agent City 换一种方式：
            把 AI 变成城市居民，把能力变成建筑，把任务变成城市里流动的工作。
          </p>
          <p>
            你可以亲手策划这座城市：谁住在哪里，谁负责什么，哪些建筑承担内容生产、数据分析、客户运营、自动化执行或知识管理。
            这座城市不是模板，而是你的 AI 工作方式的外化。
          </p>
        </div>
      </section>

      <section className="project-section project-platform" id="platform">
        <div className="project-section__header">
          <p className="project-section__eyebrow">Platform</p>
          <h2>建筑、居民和技能共同组成你的 AI 城市操作系统。</h2>
        </div>
        <div className="project-card-grid">
          {cityLayers.map((role) => (
            <article className="project-card" key={role.title}>
              <span>{role.label}</span>
              <img src={role.image} alt="" />
              <h3>{role.title}</h3>
              <p>{role.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="project-section project-scenarios" aria-labelledby="scenarios-title">
        <div>
          <p className="project-section__eyebrow">Scenes</p>
          <h2 id="scenarios-title">每个人都可以拥有不同的城市，因为每个人需要的 AI 都不一样。</h2>
        </div>
        <div className="project-scenarios__list">
          {scenarios.map((scenario, index) => (
            <article key={scenario}>
              <strong>{String(index + 1).padStart(2, "0")}</strong>
              <p>{scenario}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="project-section project-future" id="future">
        <div className="project-future__image">
          <img src="/scene-themes/sky-observatory.png" alt="" />
        </div>
        <div>
          <p className="project-section__eyebrow">Future</p>
          <h2>未来的 AI，不只是助手，而是与你共同生活在城市里的居民。</h2>
          <p>
            Agent City 的长期方向不是增加更多按钮，而是让城市持续成长：
            新居民搬入，新建筑落成，新技能被安装，新工作流被连接。
            最终，每个人都能拥有一座属于自己的 AI 城市，并像管理团队一样管理这些 AI 居民。
          </p>
        </div>
      </section>

      <section className="project-section project-deploy" id="deploy">
        <div>
          <p className="project-section__eyebrow">Deploy</p>
          <h2>从本地开始，搭起你的第一座 AI 城市。</h2>
          <p>
            当前版本支持自托管运行：前端和 API 由同一个服务提供，布局数据保存在本地 SQLite。
            你可以先在自己的电脑、VPS、NAS 或家用服务器里建起第一座城市，再慢慢扩展居民、建筑和技能。
          </p>
        </div>
        <div className="project-command" aria-label="Docker 部署命令">
          <span>推荐启动方式</span>
          <code>docker compose up -d</code>
        </div>
      </section>
    </main>
  );
}

function AgentCityExperience() {
  const init = useCityStore((s) => s.init);
  const placeBuilding = useCityStore((s) => s.placeBuilding);
  const moveBuilding = useCityStore((s) => s.moveBuilding);
  const placeCustomAsset = useCityStore((s) => s.placeCustomAsset);
  const canPlaceAt = useCityStore((s) => s.canPlaceAt);
  const buildings = useCityStore((s) => s.buildings);
  const customAssets = useCityStore((s) => s.customAssets);
  const grid = useCityStore((s) => s.grid);
  const buildMode = useCityStore((s) => s.buildMode);
  const buildPreviewMode = useCityStore((s) => s.buildPreviewMode);
  const selectedId = useCityStore((s) => s.selectedId);
  const themeMode = useCityStore((s) => s.themeMode);
  const timeOfDay = useCityStore((s) => s.timeOfDay);
  const gridRef = useRef<HTMLDivElement>(null);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const discardLayoutEdits = useCityStore((s) => s.discardLayoutEdits);
  const layoutEditDirty = useCityStore((s) => s.layoutEditDirty);
  const openLayoutSchemeModal = useCityStore((s) => s.openLayoutSchemeModal);
  const openSettings = useCityStore((s) => s.openSettings);
  const [dockTab, setDockTab] = useState<DockTab>("building");
  const [assetLibraryOpen, setAssetLibraryOpen] = useState(false);
  const [immersive] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  useEffect(() => {
    document.documentElement.dataset.agentTheme = themeMode;
  }, [themeMode]);

  useEffect(() => {
    let cancelled = false;
    init().finally(() => {
      if (!cancelled) setInitialized(true);
    });
    return () => {
      cancelled = true;
    };
  }, [init]);

  /** Resolve a drag event's dragged type/size/id + the grid cell under the pointer. */
  function resolveDrag(event: DragStartEvent | DragMoveEvent | DragEndEvent) {
    const gridEl = gridRef.current;
    const translated = event.active.rect.current.translated;
    if (!gridEl || !translated) return null;

    const gridRect = gridEl.getBoundingClientRect();
    const zoom = gridRect.width / isoMapSize(grid.cols, grid.rows).width;
    const pointerX = (translated.left + translated.width / 2 - gridRect.left) / zoom;
    const pointerY = (translated.top + translated.height / 2 - gridRect.top) / zoom;
    const gridPoint = screenToIso(pointerX, pointerY);
    const gx = gridPoint.x;
    const gy = gridPoint.y;

    const data = event.active.data.current as DragData;
    if (!data) return null;

    if (data.source === "library") {
      const bt = buildingTypes[data.type];
      if (!bt) return null;
      return { type: data.type, size: bt.size, x: gx, y: gy, ignoreId: undefined };
    }
    if (data.source === "custom-asset") {
      const customAsset = customAssets.find((asset) => asset.id === data.assetId);
      const customBuildingSize = getCustomBuildingSize(customAsset?.url);
      const size = data.kind === "terrain" ? [2, 2] : data.kind === "decoration" ? [4, 4] : customBuildingSize;
      return {
        type: "custom-asset",
        size: size as [number, number],
        x: gx,
        y: gy,
        ignoreId: undefined,
        customAssetId: data.assetId,
        customKind: data.kind,
      };
    }
    const building = buildings.find((b) => b.id === data.id);
    if (!building) return null;
    return {
      type: building.type,
      size: getPlacedBuildingSize(building, buildingTypes),
      x: gx,
      y: gy,
      ignoreId: building.id,
    };
  }

  function handleDragMove(event: DragMoveEvent) {
    const resolved = resolveDrag(event);
    if (!resolved) {
      setDragPreview(null);
      return;
    }
    setDragPreview({
      x: resolved.x,
      y: resolved.y,
      size: resolved.size,
      valid: resolved.type === "custom-asset"
        ? resolved.customKind === "building"
          ? canPlaceAt("custom-link", resolved.x, resolved.y)
          : resolved.x >= 0 && resolved.y >= 0 && resolved.x < grid.cols && resolved.y < grid.rows
        : canPlaceAt(resolved.type, resolved.x, resolved.y, resolved.ignoreId),
    });
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragPreview(null);
    const resolved = resolveDrag(event);
    if (!resolved) return;

    const data = event.active.data.current as DragData;
    if (data?.source === "library") {
      placeBuilding(data.type, resolved.x, resolved.y);
    } else if (data?.source === "building") {
      moveBuilding(data.id, resolved.x, resolved.y);
    } else if (data?.source === "custom-asset") {
      const coordinateScale = data.kind === "building" ? 1 : 2;
      placeCustomAsset(data.assetId, resolved.x * coordinateScale, resolved.y * coordinateScale);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragPreview(null)}
    >
      <DesktopNotificationCoordinator />
      <div className={`agent-city-app-shell app-theme-${themeMode} city-time-${timeOfDay}`}>
        <div className="agent-city-map-layer">
          {initialized && (
            <>
              <CityCanvas ref={gridRef} dragPreview={dragPreview} />
              {!immersive && selectedId && !buildMode && <BuildingConfigPanel />}
              {!immersive && !buildMode && (
                <div className="city-primary-actions">
                  <button className="city-icon-action" onClick={() => { openLayoutSchemeModal(); setDockTab("building"); }} aria-label="打开布局方案" title="布局方案">
                    <span aria-hidden="true">🔨</span>
                  </button>
                  <button className="city-icon-action" onClick={openSettings} aria-label="打开城市设置" title="设置">
                    <span aria-hidden="true">⚙</span>
                  </button>
                </div>
              )}
              {!immersive && buildMode && !buildPreviewMode && (
                <PlacementDock
                  tab={dockTab}
                  onTabChange={setDockTab}
                  onClose={() => {
                    if (layoutEditDirty) setDiscardConfirmOpen(true);
                    else discardLayoutEdits();
                  }}
                />
              )}
            </>
          )}
        </div>
        {discardConfirmOpen && (
          <div className="discard-confirm-backdrop" onMouseDown={() => setDiscardConfirmOpen(false)}>
            <div
              className="discard-confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="discard-confirm-title"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="discard-confirm-dialog__icon" aria-hidden="true">!</div>
              <h2 id="discard-confirm-title">退出布局编辑？</h2>
              <p>上次保存之后的所有修改都会丢失，且无法恢复。</p>
              <div className="discard-confirm-dialog__actions">
                <button onClick={() => setDiscardConfirmOpen(false)}>继续编辑</button>
                <button
                  className="is-danger"
                  onClick={() => {
                    discardLayoutEdits();
                    setDiscardConfirmOpen(false);
                  }}
                >
                  退出且不保存
                </button>
              </div>
            </div>
          </div>
        )}
        {initialized && (
          <>
            <SkillHallModal />
            <CharacterLibraryModal />
            <CharacterConfigModal />
            <CharacterChatModal />
            <SettingsModal />
            <BookmarkManagerModal />
            <CityHallModal />
            <TodoHallModal />
            <ServerDashboardModal />
            <ThemeHallModal />
            <LayoutSchemeModal />
            <AssetLibraryModal open={assetLibraryOpen} onClose={() => setAssetLibraryOpen(false)} />
          </>
        )}
      </div>
    </DndContext>
  );
}
